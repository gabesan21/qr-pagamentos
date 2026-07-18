import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import pg from "pg";

const { Client } = pg;
const image = "postgres:18.4-bookworm";
const container = `qr-pagamentos-db-test-${process.pid}-${randomUUID().slice(0, 8)}`;
let cleanupRequired = false;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function cleanup() {
  if (!cleanupRequired) return;
  spawnSync("docker", ["rm", "-f", "-v", container], { stdio: "ignore" });
  cleanupRequired = false;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanup();
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectSqlState(client, sql, expected) {
  try {
    await client.query(sql);
  } catch (error) {
    assert(error?.code === expected.code, `${sql}: expected ${expected.code}, got ${error?.code}`);
    if (expected.constraint) {
      assert(error.constraint === expected.constraint, `${sql}: unexpected constraint ${error.constraint}`);
    }
    if (expected.column) {
      assert(error.column === expected.column, `${sql}: unexpected column ${error.column}`);
    }
    return;
  }
  throw new Error(`${sql}: forbidden statement unexpectedly succeeded`);
}

async function expectDenied(client, sql) {
  await client.query("BEGIN");
  try {
    await expectSqlState(client, sql, { code: "42501" });
  } finally {
    await client.query("ROLLBACK");
  }
}

try {
  run("docker", [
    "run", "-d", "--rm", "--name", container,
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
    "-e", "POSTGRES_DB=qr_pagamentos",
    "-p", "127.0.0.1::5432",
    image,
  ]);
  cleanupRequired = true;

  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = spawnSync("docker", [
      "exec", container, "psql", "-U", "postgres", "-d", "qr_pagamentos",
      "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1",
    ]);
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert(ready, "PostgreSQL did not become ready");

  const portOutput = run("docker", ["port", container, "5432/tcp"]).trim();
  const port = portOutput.match(/127\.0\.0\.1:(\d+)$/)?.[1];
  assert(port, `Could not parse loopback port from ${portOutput}`);

  const adminUrl = `postgresql://postgres@127.0.0.1:${port}/qr_pagamentos`;
  const migratorUrl = `postgresql://qr_migrator@127.0.0.1:${port}/qr_pagamentos?schema=app`;
  const runtimeUrl = `postgresql://qr_runtime@127.0.0.1:${port}/qr_pagamentos?schema=app`;
  const bootstrap = await readFile("prisma/bootstrap.sql", "utf8");
  run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "qr_pagamentos"], { input: bootstrap });

  const migrator = new Client({ connectionString: migratorUrl });
  await migrator.connect();
  const migratorCheck = await migrator.query(`
    SELECT current_user,
      has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
      r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolinherit, r.rolreplication, r.rolbypassrls,
      pg_get_userbyid(n.nspowner) AS schema_owner
    FROM pg_roles r
    JOIN pg_namespace n ON n.nspname = 'app'
    WHERE r.rolname = current_user
  `);
  assert(migratorCheck.rows.length === 1, "Missing migrator role evidence");
  const migratorRole = migratorCheck.rows[0];
  assert(migratorRole.current_user === "qr_migrator" && migratorRole.can_connect, "Migrator connection identity failed");
  assert(migratorRole.schema_owner === "qr_migrator", "Migrator does not own app schema");
  assert(!migratorRole.rolsuper && !migratorRole.rolcreatedb && !migratorRole.rolcreaterole && !migratorRole.rolinherit && !migratorRole.rolreplication && !migratorRole.rolbypassrls, "Migrator has forbidden role attributes");
  await migrator.end();
  console.log("PASS migrator-connect");

  const migrationEnv = { ...process.env, MIGRATION_DATABASE_URL: migratorUrl };
  delete migrationEnv.DATABASE_URL;
  const firstDeploy = run("pnpm", ["exec", "prisma", "migrate", "deploy"], { env: migrationEnv });
  assert(firstDeploy.includes("12 migrations found"), "Fresh deploy did not discover exactly twelve migrations");

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const history = await admin.query(`
    SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at
    FROM app._prisma_migrations
  `);
  const expectedMigrations = ["20260714000000_foundation_baseline", "20260714190000_local_identities", "20260716110000_database_sessions", "20260716160000_user_language_preference", "20260716180000_global_payment_settings", "20260716210000_restrict_global_payment_settings_runtime", "20260717190000_nautt_credentials", "20260717210000_nautt_webhook_registration", "20260717230000_nautt_credential_revision", "20260718010000_provider_orders", "20260718030000_nautt_webhook_deliveries", "20260718050000_nautt_webhook_recovery"];
  assert(history.rows.length === expectedMigrations.length, "Migration history row count changed");
  for (const migrationName of expectedMigrations) {
    const migrationSql = await readFile(`prisma/migrations/${migrationName}/migration.sql`);
    const checksum = createHash("sha256").update(migrationSql).digest("hex");
    const row = history.rows.find((candidate) => candidate.migration_name === migrationName);
    assert(row?.checksum === checksum && row.finished && row.rolled_back_at === null, `Migration checksum/state mismatch for ${migrationName}`);
  }
  console.log("PASS migration-replay");

  const secondDeploy = run("pnpm", ["exec", "prisma", "migrate", "deploy"], { env: migrationEnv });
  const status = run("pnpm", ["exec", "prisma", "migrate", "status"], { env: migrationEnv });
  assert(secondDeploy.includes("No pending migrations to apply"), "Second deploy was not a no-op");
  assert(status.includes("Database schema is up to date"), "Migration status is not current");
  run("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "qr_pagamentos"], { input: bootstrap });
  console.log("PASS migration-idempotence");

  const runtime = new Client({ connectionString: runtimeUrl });
  await runtime.connect();
  const columns = await runtime.query(`
    SELECT column_name, data_type, udt_name, is_nullable, is_identity, column_default
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = '_database_foundation_fixture'
    ORDER BY ordinal_position
  `);
  assert(JSON.stringify(columns.rows.map(({ column_name, data_type, udt_name, is_nullable, is_identity }) => ({ column_name, data_type, udt_name, is_nullable, is_identity }))) === JSON.stringify([
    { column_name: "id", data_type: "bigint", udt_name: "int8", is_nullable: "NO", is_identity: "YES" },
    { column_name: "key", data_type: "character varying", udt_name: "varchar", is_nullable: "NO", is_identity: "NO" },
    { column_name: "quantity", data_type: "integer", udt_name: "int4", is_nullable: "NO", is_identity: "NO" },
    { column_name: "created_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO", is_identity: "NO" },
  ]), "Fixture columns differ from the contract");
  assert(columns.rows[3].column_default?.includes("CURRENT_TIMESTAMP"), "created_at lacks its database default");
  const constraints = await runtime.query(`
    SELECT c.conname, c.contype, pg_get_userbyid(t.relowner) AS owner
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app' AND t.relname = '_database_foundation_fixture'
    ORDER BY c.conname
  `);
  const constraintNames = new Set(constraints.rows.map((row) => row.conname));
  for (const name of ["_database_foundation_fixture_pkey", "database_foundation_fixture_key_key", "database_foundation_fixture_key_nonblank", "database_foundation_fixture_quantity_nonnegative"]) {
    assert(constraintNames.has(name), `Missing constraint ${name}`);
  }
  assert(constraints.rows.every((row) => row.owner === "qr_migrator"), "Runtime owns the fixture");
  console.log("PASS foundation-schema");

  const runtimeProbeEnv = { ...process.env, DATABASE_URL: runtimeUrl };
  delete runtimeProbeEnv.MIGRATION_DATABASE_URL;
  const runtimeProbe = run("pnpm", ["exec", "vitest", "run", "pop/scripts/db-runtime.test.ts", "--reporter=dot"], { env: runtimeProbeEnv });
  assert(runtimeProbe.includes("PASS runtime-crud"), "Prisma runtime CRUD probe did not pass");
  assert(runtimeProbe.includes("PASS provider-order-runtime"), "Prisma provider order concurrency/CAS probe did not pass");
  assert(runtimeProbe.includes("PASS webhook-delivery-runtime"), "Prisma webhook delivery concurrency/lease probe did not pass");
  console.log("PASS runtime-crud");
  console.log("PASS provider-order-runtime");
  console.log("PASS webhook-delivery-runtime");

  await expectSqlState(runtime, `INSERT INTO app._database_foundation_fixture (key, quantity) VALUES (NULL, 0)`, { code: "23502", column: "key" });
  await runtime.query(`INSERT INTO app._database_foundation_fixture (key, quantity) VALUES ('constraint-duplicate', 0)`);
  await expectSqlState(runtime, `INSERT INTO app._database_foundation_fixture (key, quantity) VALUES ('constraint-duplicate', 1)`, { code: "23505", constraint: "database_foundation_fixture_key_key" });
  await runtime.query(`DELETE FROM app._database_foundation_fixture WHERE key = 'constraint-duplicate'`);
  await expectSqlState(runtime, `INSERT INTO app._database_foundation_fixture (key, quantity) VALUES ('   ', 0)`, { code: "23514", constraint: "database_foundation_fixture_key_nonblank" });
  await expectSqlState(runtime, `INSERT INTO app._database_foundation_fixture (key, quantity) VALUES ('negative', -1)`, { code: "23514", constraint: "database_foundation_fixture_quantity_nonnegative" });
  console.log("PASS constraint-sqlstates");

  const userId = randomUUID();
  const otherUserId = randomUUID();
  const thirdUserId = randomUUID();
  const missingUserId = randomUUID();
  const passwordHash = "scrypt$v=1$N=131072,r=8,p=1$AAECAwQFBgcICQoLDA0ODw$GylG2nH0EXnoO5ncM4QtFXQbh8QSHIx_N4HB34ZPtYs";
  await runtime.query(`INSERT INTO app."user" (id, username, email, role, status) VALUES ($1, 'admin.user', 'admin@example.com', 'ADMIN', 'ACTIVE')`, [userId]);
  await runtime.query(`INSERT INTO app.password_credential (user_id, password_hash) VALUES ($1, $2)`, [userId, passwordHash]);
  await runtime.query(`INSERT INTO app.deployment_bootstrap (id, initial_admin_user_id) VALUES (1, $1)`, [userId]);
  await expectSqlState(runtime, `INSERT INTO app."user" (id, username, email, role, status) VALUES ('${otherUserId}', 'admin.user', NULL, 'USER', 'ACTIVE')`, { code: "23505", constraint: "user_username_key" });
  await expectSqlState(runtime, `INSERT INTO app."user" (id, username, email, role, status) VALUES ('${otherUserId}', 'Admin.User', NULL, 'USER', 'ACTIVE')`, { code: "23514", constraint: "user_username_canonical" });
  await expectSqlState(runtime, `INSERT INTO app."user" (id, username, email, role, status) VALUES ('${otherUserId}', 'admin..user', NULL, 'USER', 'ACTIVE')`, { code: "23514", constraint: "user_username_canonical" });
  await runtime.query(`INSERT INTO app."user" (id, username, email, role, status) VALUES ($1, 'second.user', NULL, 'USER', 'ACTIVE')`, [otherUserId]);
  await runtime.query(`INSERT INTO app."user" (id, username, email, role, status) VALUES ($1, 'third.user', NULL, 'USER', 'ACTIVE')`, [thirdUserId]);
  await expectSqlState(runtime, `UPDATE app."user" SET email = 'admin@example.com' WHERE id = '${otherUserId}'`, { code: "23505", constraint: "user_email_key" });
  await expectSqlState(runtime, `UPDATE app."user" SET email = 'Admin@example.com' WHERE id = '${otherUserId}'`, { code: "23514", constraint: "user_email_canonical" });
  await expectSqlState(runtime, `UPDATE app."user" SET role = 'OWNER' WHERE id = '${otherUserId}'`, { code: "23514", constraint: "user_role_closed" });
  await expectSqlState(runtime, `UPDATE app."user" SET status = 'LOCKED' WHERE id = '${otherUserId}'`, { code: "23514", constraint: "user_status_closed" });
  await expectSqlState(runtime, `INSERT INTO app.password_credential (user_id, password_hash) VALUES ('${missingUserId}', '${passwordHash}')`, { code: "23503", constraint: "password_credential_user_fkey" });
  await expectSqlState(runtime, `UPDATE app.password_credential SET password_hash = 'not-a-credential' WHERE user_id = '${userId}'`, { code: "23514", constraint: "password_credential_hash_format" });
  await expectSqlState(runtime, `INSERT INTO app.deployment_bootstrap (id, initial_admin_user_id) VALUES (2, '${userId}')`, { code: "23514", constraint: "deployment_bootstrap_singleton" });
  await expectSqlState(runtime, `UPDATE app.deployment_bootstrap SET initial_admin_user_id = '${otherUserId}' WHERE id = 1`, { code: "23514" });
  await expectSqlState(runtime, `DELETE FROM app.deployment_bootstrap WHERE id = 1`, { code: "23514" });
  await runtime.query(`UPDATE app."user" SET role = 'USER', status = 'DISABLED' WHERE id = $1`, [userId]);
  await runtime.query(`DELETE FROM app."user" WHERE id = $1`, [userId]);
  const locator = await runtime.query(`SELECT b.initial_admin_user_id, u.id AS resolved_user_id FROM app.deployment_bootstrap b LEFT JOIN app."user" u ON u.id = b.initial_admin_user_id WHERE b.id = 1`);
  assert(locator.rows.length === 1 && locator.rows[0].initial_admin_user_id === userId && locator.rows[0].resolved_user_id === null, "Deleted identity did not leave an unresolved immutable locator");
  console.log("PASS identity-constraints");
  console.log("PASS deployment-locator-immutability");
  console.log("PASS user-lifecycle-with-tombstone");

  const sessionColumns = await runtime.query(`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'session'
    ORDER BY ordinal_position
  `);
  assert(JSON.stringify(sessionColumns.rows) === JSON.stringify([
    { column_name: "id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "user_id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "token_digest", data_type: "character varying", udt_name: "varchar", is_nullable: "NO" },
    { column_name: "created_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
    { column_name: "last_seen_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
    { column_name: "absolute_expires_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
  ]), "Session columns differ from the contract");
  const sessionDigest = "a".repeat(64);
  await runtime.query(`INSERT INTO app.session (user_id, token_digest, absolute_expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '12 hours')`, [thirdUserId, sessionDigest]);
  await expectSqlState(runtime, `INSERT INTO app.session (user_id, token_digest, absolute_expires_at) VALUES ('${thirdUserId}', '${sessionDigest}', CURRENT_TIMESTAMP + INTERVAL '12 hours')`, { code: "23505", constraint: "session_token_digest_key" });
  await runtime.query(`DELETE FROM app."user" WHERE id = $1`, [thirdUserId]);
  const cascadedSession = await runtime.query(`SELECT count(*)::int AS count FROM app.session WHERE token_digest = $1`, [sessionDigest]);
  assert(cascadedSession.rows[0].count === 0, "Session did not cascade with its user");
  console.log("PASS session-schema");

  const localeColumn = await runtime.query(`
    SELECT data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'user' AND column_name = 'preferred_locale'
  `);
  assert(JSON.stringify(localeColumn.rows) === JSON.stringify([{ data_type: "character varying", udt_name: "varchar", is_nullable: "YES" }]), "Preferred locale column differs from the contract");
  await runtime.query(`UPDATE app."user" SET preferred_locale = 'en' WHERE id = $1`, [otherUserId]);
  const savedLocale = await runtime.query(`SELECT preferred_locale FROM app."user" WHERE id = $1`, [otherUserId]);
  assert(savedLocale.rows[0]?.preferred_locale === "en", "Runtime could not persist a supported locale");
  await expectSqlState(runtime, `UPDATE app."user" SET preferred_locale = 'es' WHERE id = '${otherUserId}'`, { code: "23514", constraint: "user_preferred_locale_check" });
  console.log("PASS language-preference-schema");

  const paymentSettings = await runtime.query(`SELECT id, currencies, payment_methods FROM app.global_payment_settings`);
  assert(JSON.stringify(paymentSettings.rows) === JSON.stringify([{ id: 1, currencies: ["BRL"], payment_methods: ["PIX"] }]), "Global payment settings seed differs from the contract");
  await runtime.query(`UPDATE app.global_payment_settings SET currencies = ARRAY[]::TEXT[], payment_methods = ARRAY[]::TEXT[] WHERE id = 1`);
  await expectSqlState(runtime, `UPDATE app.global_payment_settings SET currencies = ARRAY['USD']::TEXT[] WHERE id = 1`, { code: "23514", constraint: "global_payment_settings_currencies_closed" });
  await expectSqlState(runtime, `UPDATE app.global_payment_settings SET payment_methods = ARRAY['CARD']::TEXT[] WHERE id = 1`, { code: "23514", constraint: "global_payment_settings_payment_methods_closed" });
  await expectSqlState(admin, `INSERT INTO app.global_payment_settings (id, currencies, payment_methods) VALUES (2, ARRAY['BRL']::TEXT[], ARRAY['PIX']::TEXT[])`, { code: "23514", constraint: "global_payment_settings_singleton" });
  await expectDenied(runtime, `INSERT INTO app.global_payment_settings (id, currencies, payment_methods) VALUES (2, ARRAY['BRL']::TEXT[], ARRAY['PIX']::TEXT[])`);
  await expectDenied(runtime, `DELETE FROM app.global_payment_settings WHERE id = 1`);
  await expectDenied(runtime, `UPDATE app.global_payment_settings SET id = 2 WHERE id = 1`);
  console.log("PASS global-payment-settings-schema");
  console.log("PASS global-payment-settings-runtime-denials");

  const backfillUserId = randomUUID();
  const revisionMigrator = new Client({ connectionString: migratorUrl });
  await revisionMigrator.connect();
  await revisionMigrator.query(`ALTER TABLE app.nautt_credential DROP CONSTRAINT nautt_credential_credential_revision_key, DROP COLUMN credential_revision`);
  await runtime.query(`INSERT INTO app."user" (id, username, email, role, status) VALUES ($1, 'nautt.backfill', NULL, 'USER', 'ACTIVE')`, [backfillUserId]);
  await runtime.query(`INSERT INTO app.nautt_credential (user_id, encrypted_api_key) VALUES ($1, 'pre-existing-encrypted-value')`, [backfillUserId]);
  await revisionMigrator.query(await readFile("prisma/migrations/20260717230000_nautt_credential_revision/migration.sql", "utf8"));
  const backfilledRevision = await runtime.query(`SELECT credential_revision FROM app.nautt_credential WHERE user_id = $1`, [backfillUserId]);
  assert(typeof backfilledRevision.rows[0]?.credential_revision === "string", "Pre-existing credential revision was not backfilled");
  await runtime.query(`DELETE FROM app."user" WHERE id = $1`, [backfillUserId]);
  await revisionMigrator.end();
  console.log("PASS nautt-credential-revision-backfill");

  const nauttCredentialColumns = await runtime.query(`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'nautt_credential'
    ORDER BY ordinal_position
  `);
  assert(JSON.stringify(nauttCredentialColumns.rows) === JSON.stringify([
    { column_name: "user_id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "encrypted_api_key", data_type: "text", udt_name: "text", is_nullable: "NO" },
    { column_name: "created_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
    { column_name: "updated_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
    { column_name: "webhook_registration_state", data_type: "character varying", udt_name: "varchar", is_nullable: "NO" },
    { column_name: "provider_webhook_id", data_type: "uuid", udt_name: "uuid", is_nullable: "YES" },
    { column_name: "encrypted_webhook_secret", data_type: "text", udt_name: "text", is_nullable: "YES" },
    { column_name: "webhook_registered_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "YES" },
    { column_name: "credential_revision", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
  ]), "Nautt credential columns differ from the contract");
  const nauttCredentialConstraints = await runtime.query(`
    SELECT c.conname, c.contype, pg_get_userbyid(t.relowner) AS owner
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app' AND t.relname = 'nautt_credential'
    ORDER BY c.conname
  `);
  const nauttConstraintNames = new Set(nauttCredentialConstraints.rows.map((row) => row.conname));
  for (const name of ["nautt_credential_pkey", "nautt_credential_user_fkey", "nautt_credential_webhook_registration_state_closed", "nautt_credential_webhook_active_tuple_complete", "nautt_credential_credential_revision_key"]) {
    assert(nauttConstraintNames.has(name), `Missing constraint ${name}`);
  }
  assert(nauttCredentialConstraints.rows.every((row) => row.owner === "qr_migrator"), "Runtime owns the nautt credential table");
  const nauttUserId = randomUUID();
  await runtime.query(`INSERT INTO app."user" (id, username, email, role, status) VALUES ($1, 'nautt.user', NULL, 'USER', 'ACTIVE')`, [nauttUserId]);
  await runtime.query(`INSERT INTO app.nautt_credential (user_id, encrypted_api_key) VALUES ($1, 'encrypted-value')`, [nauttUserId]);
  const defaultRegistration = await runtime.query(`SELECT webhook_registration_state, credential_revision FROM app.nautt_credential WHERE user_id = $1`, [nauttUserId]);
  assert(defaultRegistration.rows[0]?.webhook_registration_state === "UNREGISTERED", "Existing credential did not default to UNREGISTERED");
  const originalRevision = defaultRegistration.rows[0]?.credential_revision;
  assert(typeof originalRevision === "string", "Credential revision did not receive its UUID default");
  const freshRevision = randomUUID();
  const staleCas = await runtime.query(`UPDATE app.nautt_credential SET encrypted_api_key = 'wrong-value', credential_revision = $3, updated_at = TIMESTAMPTZ '2026-07-17 20:00:00Z' WHERE user_id = $1 AND credential_revision = $2 AND webhook_registration_state = 'UNREGISTERED'`, [nauttUserId, randomUUID(), randomUUID()]);
  assert(staleCas.rowCount === 0, "Stale credential revision mutated the row");
  const winningCas = await runtime.query(`UPDATE app.nautt_credential SET encrypted_api_key = 'replaced-value', credential_revision = $3, updated_at = TIMESTAMPTZ '2026-07-17 20:00:00Z' WHERE user_id = $1 AND credential_revision = $2 AND webhook_registration_state = 'UNREGISTERED'`, [nauttUserId, originalRevision, freshRevision]);
  assert(winningCas.rowCount === 1, "Exact credential revision CAS did not win");
  const staleClaim = await runtime.query(`UPDATE app.nautt_credential SET webhook_registration_state = 'REGISTERING' WHERE user_id = $1 AND credential_revision = $2 AND webhook_registration_state = 'UNREGISTERED'`, [nauttUserId, originalRevision]);
  assert(staleClaim.rowCount === 0, "Stale exact revision claimed the replacement");
  const winningClaim = await runtime.query(`UPDATE app.nautt_credential SET webhook_registration_state = 'REGISTERING' WHERE user_id = $1 AND credential_revision = $2 AND webhook_registration_state = 'UNREGISTERED'`, [nauttUserId, freshRevision]);
  assert(winningClaim.rowCount === 1, "Winning exact revision could not be claimed");
  await runtime.query(`UPDATE app.nautt_credential SET webhook_registration_state = 'INDETERMINATE' WHERE user_id = $1`, [nauttUserId]);
  await expectSqlState(runtime, `UPDATE app.nautt_credential SET webhook_registration_state = 'UNKNOWN' WHERE user_id = '${nauttUserId}'`, { code: "23514", constraint: "nautt_credential_webhook_registration_state_closed" });
  await expectSqlState(runtime, `UPDATE app.nautt_credential SET webhook_registration_state = 'ACTIVE' WHERE user_id = '${nauttUserId}'`, { code: "23514", constraint: "nautt_credential_webhook_active_tuple_complete" });
  await expectSqlState(runtime, `UPDATE app.nautt_credential SET provider_webhook_id = '${randomUUID()}' WHERE user_id = '${nauttUserId}'`, { code: "23514", constraint: "nautt_credential_webhook_active_tuple_complete" });
  const providerWebhookId = randomUUID();
  await runtime.query(`UPDATE app.nautt_credential SET webhook_registration_state = 'ACTIVE', provider_webhook_id = $2, encrypted_webhook_secret = 'encrypted-webhook-secret', webhook_registered_at = CURRENT_TIMESTAMP WHERE user_id = $1`, [nauttUserId, providerWebhookId]);
  await expectSqlState(runtime, `UPDATE app.nautt_credential SET encrypted_webhook_secret = NULL WHERE user_id = '${nauttUserId}'`, { code: "23514", constraint: "nautt_credential_webhook_active_tuple_complete" });
  await runtime.query(`DELETE FROM app."user" WHERE id = $1`, [nauttUserId]);
  const cascadedCredential = await runtime.query(`SELECT count(*)::int AS count FROM app.nautt_credential WHERE user_id = $1`, [nauttUserId]);
  assert(cascadedCredential.rows[0].count === 0, "Nautt credential did not cascade with its user");
  console.log("PASS nautt-credential-schema");

  const providerOwnerId = randomUUID();
  const providerOtherOwnerId = randomUUID();
  const providerQuoteUuid = randomUUID();
  const providerOrderUuid = randomUUID();
  await runtime.query(`INSERT INTO app."user" (id, username, email, role, status) VALUES ($1, 'provider.owner', NULL, 'USER', 'ACTIVE'), ($2, 'provider.other', NULL, 'USER', 'ACTIVE')`, [providerOwnerId, providerOtherOwnerId]);
  await runtime.query(`INSERT INTO app.provider_quote (quote_uuid, owner_id, expires_at) VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, [providerQuoteUuid, providerOwnerId]);
  await expectSqlState(runtime, `INSERT INTO app.provider_quote (quote_uuid, owner_id, expires_at) VALUES ('${providerQuoteUuid}', '${providerOwnerId}', CURRENT_TIMESTAMP + INTERVAL '5 minutes')`, { code: "23505", constraint: "provider_quote_pkey" });
  await expectSqlState(runtime, `INSERT INTO app.provider_order (owner_id, quote_uuid) VALUES ('${providerOtherOwnerId}', '${providerQuoteUuid}')`, { code: "23503", constraint: "provider_order_quote_owner_fkey" });
  await expectSqlState(runtime, `INSERT INTO app.provider_order (owner_id, quote_uuid, provider_order_uuid, creation_state, status, fiat_amount, crypto_amount, nautt_quote, provider_expires_at, payment_method) VALUES ('${providerOwnerId}', '${providerQuoteUuid}', '${providerOrderUuid}', 'CREATED', 'new', '-1.00', '2.00', '3.00', CURRENT_TIMESTAMP, 'pix')`, { code: "23514", constraint: "provider_order_decimal_lexemes" });
  await expectSqlState(runtime, `INSERT INTO app.provider_order (owner_id, quote_uuid, creation_state) VALUES ('${providerOwnerId}', '${providerQuoteUuid}', 'CREATED')`, { code: "23514", constraint: "provider_order_creation_tuple" });
  const providerOrder = await runtime.query(`INSERT INTO app.provider_order (owner_id, quote_uuid, provider_order_uuid, creation_state, status, fiat_amount, crypto_amount, nautt_quote, provider_expires_at, payment_method) VALUES ($1, $2, $3, 'CREATED', 'new', '1000.0000', '196.0784', '5.1000', CURRENT_TIMESTAMP + INTERVAL '5 minutes', 'pix') RETURNING id`, [providerOwnerId, providerQuoteUuid, providerOrderUuid]);
  await expectSqlState(runtime, `UPDATE app.provider_order SET status = 'unknown' WHERE quote_uuid = '${providerQuoteUuid}'`, { code: "23514", constraint: "provider_order_status_closed" });
  const deliveryUuid = randomUUID();
  await runtime.query(`INSERT INTO app.webhook_delivery (delivery_uuid, owner_id, provider_order_id, provider_order_uuid, event_type, provider_created_at, payload_digest, decision, lease_expires_at, processing_attempt_number) VALUES ($1, $2, $3, $4, 'order.paid', CURRENT_TIMESTAMP, $5, 'PROCESSING', CURRENT_TIMESTAMP + INTERVAL '14 seconds', 1)`, [deliveryUuid, providerOwnerId, providerOrder.rows[0].id, providerOrderUuid, "a".repeat(64)]);
  await runtime.query(`INSERT INTO app.webhook_delivery_attempt (delivery_uuid, attempt_number, outcome, payload_digest) VALUES ($1, 1, 'CLAIMED', $2)`, [deliveryUuid, "a".repeat(64)]);
  await expectSqlState(runtime, `INSERT INTO app.webhook_delivery_attempt (delivery_uuid, attempt_number, outcome, payload_digest, completed_at) VALUES ('${deliveryUuid}', 0, 'BUSY', '${"b".repeat(64)}', CURRENT_TIMESTAMP)`, { code: "23514", constraint: "webhook_delivery_attempt_number_positive" });
  await expectSqlState(runtime, `UPDATE app.webhook_delivery SET payload_digest = '${"A".repeat(64)}' WHERE delivery_uuid = '${deliveryUuid}'`, { code: "23514", constraint: "webhook_delivery_digest_lower_hex" });
  await expectSqlState(runtime, `UPDATE app.webhook_delivery SET decision = 'PROCESSED' WHERE delivery_uuid = '${deliveryUuid}'`, { code: "23514", constraint: "webhook_delivery_lease_consistent" });
  console.log("PASS webhook-delivery-schema");
  const recoveredDeliveryUuid = randomUUID();
  const recoveredWebhookUuid = randomUUID();
  await expectSqlState(runtime, `INSERT INTO app.webhook_delivery (delivery_uuid, owner_id, provider_order_id, provider_order_uuid, event_type, provider_created_at, provider_attempt_number, evidence_source, payload_digest, decision) VALUES ('${randomUUID()}', '${providerOwnerId}', '${providerOrder.rows[0].id}', '${providerOrderUuid}', 'order.failed', CURRENT_TIMESTAMP, 5, 'RECOVERY', NULL, 'IGNORED')`, { code: "23514", constraint: "webhook_delivery_evidence_consistent" });
  await runtime.query(`INSERT INTO app.webhook_delivery (delivery_uuid, owner_id, provider_order_id, provider_order_uuid, event_type, provider_created_at, provider_attempt_number, evidence_source, provider_webhook_uuid, provider_is_delivered, provider_is_permanently_failed, payload_digest, decision) VALUES ($1, $2, $3, $4, 'order.failed', CURRENT_TIMESTAMP, 5, 'RECOVERY', $5, FALSE, TRUE, NULL, 'IGNORED')`, [recoveredDeliveryUuid, providerOwnerId, providerOrder.rows[0].id, providerOrderUuid, recoveredWebhookUuid]);
  await runtime.query(`INSERT INTO app.webhook_delivery_attempt (delivery_uuid, attempt_number, outcome, provider_attempt_number, evidence_source, provider_webhook_uuid, provider_is_delivered, provider_is_permanently_failed, payload_digest, completed_at) VALUES ($1, 1, 'IGNORED', 5, 'RECOVERY', $2, FALSE, TRUE, NULL, CURRENT_TIMESTAMP)`, [recoveredDeliveryUuid, recoveredWebhookUuid]);
  const recoveredEvidence = await runtime.query(`SELECT d.evidence_source, d.payload_digest, d.provider_is_permanently_failed, a.evidence_source AS attempt_source, a.payload_digest AS attempt_digest FROM app.webhook_delivery d JOIN app.webhook_delivery_attempt a USING (delivery_uuid) WHERE d.delivery_uuid = $1`, [recoveredDeliveryUuid]);
  assert(recoveredEvidence.rows[0]?.evidence_source === "RECOVERY" && recoveredEvidence.rows[0]?.payload_digest === null && recoveredEvidence.rows[0]?.provider_is_permanently_failed && recoveredEvidence.rows[0]?.attempt_source === "RECOVERY" && recoveredEvidence.rows[0]?.attempt_digest === null, "Recovery evidence tuple changed");
  const firstFence = randomUUID();
  const secondFence = randomUUID();
  await runtime.query(`INSERT INTO app.webhook_recovery_lease (provider_order_id, owner_id, fence_token, lease_expires_at, updated_at) VALUES ($1, $2, $3, TIMESTAMPTZ '2026-07-17 20:00:30Z', TIMESTAMPTZ '2026-07-17 20:00:00Z')`, [providerOrder.rows[0].id, providerOwnerId, firstFence]);
  const busyLease = await runtime.query(`INSERT INTO app.webhook_recovery_lease (provider_order_id, owner_id, fence_token, lease_expires_at, updated_at) VALUES ($1, $2, $3, TIMESTAMPTZ '2026-07-17 20:00:54.999Z', TIMESTAMPTZ '2026-07-17 20:00:24.999Z') ON CONFLICT (provider_order_id) DO UPDATE SET fence_token = EXCLUDED.fence_token, lease_expires_at = EXCLUDED.lease_expires_at, updated_at = EXCLUDED.updated_at WHERE app.webhook_recovery_lease.lease_expires_at <= EXCLUDED.updated_at RETURNING fence_token`, [providerOrder.rows[0].id, providerOwnerId, secondFence]);
  assert(busyLease.rowCount === 0, "Recovery lease reclaimed before 30 seconds");
  const reclaimedLease = await runtime.query(`INSERT INTO app.webhook_recovery_lease (provider_order_id, owner_id, fence_token, lease_expires_at, updated_at) VALUES ($1, $2, $3, TIMESTAMPTZ '2026-07-17 20:01:00Z', TIMESTAMPTZ '2026-07-17 20:00:30Z') ON CONFLICT (provider_order_id) DO UPDATE SET fence_token = EXCLUDED.fence_token, lease_expires_at = EXCLUDED.lease_expires_at, updated_at = EXCLUDED.updated_at WHERE app.webhook_recovery_lease.lease_expires_at <= EXCLUDED.updated_at RETURNING fence_token`, [providerOrder.rows[0].id, providerOwnerId, secondFence]);
  assert(reclaimedLease.rows[0]?.fence_token === secondFence, "Expired recovery lease did not receive a fresh fence");
  const staleRelease = await runtime.query(`DELETE FROM app.webhook_recovery_lease WHERE provider_order_id = $1 AND fence_token = $2`, [providerOrder.rows[0].id, firstFence]);
  assert(staleRelease.rowCount === 0, "Stale recovery fence released the winner");
  await runtime.query(`DELETE FROM app.webhook_recovery_lease WHERE provider_order_id = $1 AND fence_token = $2`, [providerOrder.rows[0].id, secondFence]);
  console.log("PASS webhook-recovery-schema-lease");
  await runtime.query(`DELETE FROM app."user" WHERE id = $1`, [providerOwnerId]);
  const cascadedProvider = await runtime.query(`SELECT (SELECT count(*)::int FROM app.provider_quote WHERE owner_id = $1) AS quotes, (SELECT count(*)::int FROM app.provider_order WHERE owner_id = $1) AS orders`, [providerOwnerId]);
  assert(cascadedProvider.rows[0].quotes === 0 && cascadedProvider.rows[0].orders === 0, "Provider quote/order did not cascade with owner");
  await runtime.query(`DELETE FROM app."user" WHERE id = $1`, [providerOtherOwnerId]);
  console.log("PASS provider-order-schema");

  const privilege = await runtime.query(`
    SELECT current_user,
      has_schema_privilege(current_user, 'app', 'USAGE') AS schema_usage,
      has_schema_privilege(current_user, 'app', 'CREATE') AS schema_create,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'SELECT,INSERT,UPDATE,DELETE') AS table_dml,
      has_table_privilege(current_user, 'app.user', 'SELECT,INSERT,UPDATE,DELETE') AS user_dml,
      has_table_privilege(current_user, 'app.password_credential', 'SELECT,INSERT,UPDATE,DELETE') AS credential_dml,
      has_table_privilege(current_user, 'app.deployment_bootstrap', 'SELECT,INSERT,UPDATE,DELETE') AS bootstrap_dml,
      has_table_privilege(current_user, 'app.session', 'SELECT,INSERT,UPDATE,DELETE') AS session_dml,
      has_table_privilege(current_user, 'app.nautt_credential', 'SELECT,INSERT,UPDATE,DELETE') AS nautt_credential_dml,
      has_table_privilege(current_user, 'app.provider_quote', 'SELECT,INSERT,UPDATE,DELETE') AS provider_quote_dml,
      has_table_privilege(current_user, 'app.provider_order', 'SELECT,INSERT,UPDATE,DELETE') AS provider_order_dml,
      has_table_privilege(current_user, 'app.webhook_delivery', 'SELECT,INSERT,UPDATE,DELETE') AS webhook_delivery_dml,
      has_table_privilege(current_user, 'app.webhook_delivery_attempt', 'SELECT,INSERT,UPDATE,DELETE') AS webhook_attempt_dml,
      has_table_privilege(current_user, 'app.webhook_recovery_lease', 'SELECT,INSERT,UPDATE,DELETE') AS webhook_recovery_lease_dml,
      has_table_privilege(current_user, 'app.global_payment_settings', 'SELECT') AS settings_select,
      has_column_privilege(current_user, 'app.global_payment_settings', 'currencies', 'UPDATE')
        AND has_column_privilege(current_user, 'app.global_payment_settings', 'payment_methods', 'UPDATE')
        AND has_column_privilege(current_user, 'app.global_payment_settings', 'updated_at', 'UPDATE') AS settings_column_update,
      has_table_privilege(current_user, 'app.global_payment_settings', 'UPDATE') AS settings_table_update,
      has_table_privilege(current_user, 'app.global_payment_settings', 'INSERT,DELETE') AS settings_write_extra,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'TRUNCATE') AS table_truncate,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'REFERENCES') AS table_references,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'TRIGGER') AS table_trigger,
      has_table_privilege(current_user, 'app.provider_order', 'TRUNCATE,REFERENCES,TRIGGER') AS provider_order_excess,
      has_table_privilege(current_user, 'app.webhook_delivery', 'TRUNCATE,REFERENCES,TRIGGER') AS webhook_delivery_excess,
      has_table_privilege(current_user, 'app.webhook_recovery_lease', 'TRUNCATE,REFERENCES,TRIGGER') AS webhook_recovery_lease_excess,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'MAINTAIN') AS table_maintain,
      has_sequence_privilege(current_user, 'app._database_foundation_fixture_id_seq', 'USAGE') AS sequence_usage,
      has_sequence_privilege(current_user, 'app.webhook_delivery_attempt_id_seq', 'USAGE') AS webhook_sequence_usage,
      has_sequence_privilege(current_user, 'app._database_foundation_fixture_id_seq', 'SELECT') AS sequence_select,
      has_sequence_privilege(current_user, 'app._database_foundation_fixture_id_seq', 'UPDATE') AS sequence_update,
      has_table_privilege(current_user, 'app._prisma_migrations', 'SELECT,INSERT,UPDATE,DELETE') AS migration_access,
      pg_has_role(current_user, 'qr_migrator', 'MEMBER') AS migrator_member,
      pg_has_role(current_user, 'qr_migrator', 'SET') AS migrator_set
  `);
  const acl = privilege.rows[0];
  assert(acl.current_user === "qr_runtime" && acl.schema_usage && acl.table_dml && acl.user_dml && acl.credential_dml && acl.bootstrap_dml && acl.session_dml && acl.nautt_credential_dml && acl.provider_quote_dml && acl.provider_order_dml && acl.webhook_delivery_dml && acl.webhook_attempt_dml && acl.webhook_recovery_lease_dml && acl.settings_select && acl.settings_column_update && acl.sequence_usage && acl.webhook_sequence_usage, "Runtime lacks intended privileges");
  assert(!acl.settings_table_update && !acl.settings_write_extra && !acl.schema_create && !acl.table_truncate && !acl.table_references && !acl.table_trigger && !acl.provider_order_excess && !acl.webhook_delivery_excess && !acl.webhook_recovery_lease_excess && !acl.table_maintain && !acl.sequence_select && !acl.sequence_update && !acl.migration_access && !acl.migrator_member && !acl.migrator_set, "Runtime has excess privileges");
  const ownership = await admin.query(`
    SELECT
      (SELECT count(*)::int FROM pg_class WHERE relowner = 'qr_runtime'::regrole) AS objects,
      (SELECT count(*)::int FROM pg_namespace WHERE nspowner = 'qr_runtime'::regrole) AS schemas,
      (SELECT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls FROM pg_roles WHERE rolname = 'qr_runtime') AS safe_attributes
  `);
  assert(ownership.rows[0].objects === 0 && ownership.rows[0].schemas === 0 && ownership.rows[0].safe_attributes, "Runtime ownership or attributes violate isolation");
  await expectDenied(runtime, `SELECT * FROM app._prisma_migrations`);
  console.log("PASS role-separation");

  await expectDenied(runtime, `CREATE TABLE app.runtime_forbidden (id integer)`);
  await expectDenied(runtime, `ALTER TABLE app._database_foundation_fixture ADD COLUMN runtime_forbidden integer`);
  await expectDenied(runtime, `CREATE TEMP TABLE runtime_forbidden (id integer)`);
  await expectDenied(runtime, `CREATE ROLE runtime_forbidden`);
  await expectDenied(runtime, `SET ROLE qr_migrator`);
  console.log("PASS runtime-denials");

  await runtime.end();
  await admin.end();
} finally {
  cleanup();
}

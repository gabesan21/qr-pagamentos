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
  assert(firstDeploy.includes("6 migrations found"), "Fresh deploy did not discover exactly six migrations");

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const history = await admin.query(`
    SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at
    FROM app._prisma_migrations
  `);
  const expectedMigrations = ["20260714000000_foundation_baseline", "20260714190000_local_identities", "20260716110000_database_sessions", "20260716160000_user_language_preference", "20260716180000_global_payment_settings", "20260716210000_restrict_global_payment_settings_runtime"];
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
  console.log("PASS runtime-crud");

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

  const privilege = await runtime.query(`
    SELECT current_user,
      has_schema_privilege(current_user, 'app', 'USAGE') AS schema_usage,
      has_schema_privilege(current_user, 'app', 'CREATE') AS schema_create,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'SELECT,INSERT,UPDATE,DELETE') AS table_dml,
      has_table_privilege(current_user, 'app.user', 'SELECT,INSERT,UPDATE,DELETE') AS user_dml,
      has_table_privilege(current_user, 'app.password_credential', 'SELECT,INSERT,UPDATE,DELETE') AS credential_dml,
      has_table_privilege(current_user, 'app.deployment_bootstrap', 'SELECT,INSERT,UPDATE,DELETE') AS bootstrap_dml,
      has_table_privilege(current_user, 'app.session', 'SELECT,INSERT,UPDATE,DELETE') AS session_dml,
      has_table_privilege(current_user, 'app.global_payment_settings', 'SELECT') AS settings_select,
      has_column_privilege(current_user, 'app.global_payment_settings', 'currencies', 'UPDATE')
        AND has_column_privilege(current_user, 'app.global_payment_settings', 'payment_methods', 'UPDATE')
        AND has_column_privilege(current_user, 'app.global_payment_settings', 'updated_at', 'UPDATE') AS settings_column_update,
      has_table_privilege(current_user, 'app.global_payment_settings', 'UPDATE') AS settings_table_update,
      has_table_privilege(current_user, 'app.global_payment_settings', 'INSERT,DELETE') AS settings_write_extra,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'TRUNCATE') AS table_truncate,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'REFERENCES') AS table_references,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'TRIGGER') AS table_trigger,
      has_table_privilege(current_user, 'app._database_foundation_fixture', 'MAINTAIN') AS table_maintain,
      has_sequence_privilege(current_user, 'app._database_foundation_fixture_id_seq', 'USAGE') AS sequence_usage,
      has_sequence_privilege(current_user, 'app._database_foundation_fixture_id_seq', 'SELECT') AS sequence_select,
      has_sequence_privilege(current_user, 'app._database_foundation_fixture_id_seq', 'UPDATE') AS sequence_update,
      has_table_privilege(current_user, 'app._prisma_migrations', 'SELECT,INSERT,UPDATE,DELETE') AS migration_access,
      pg_has_role(current_user, 'qr_migrator', 'MEMBER') AS migrator_member,
      pg_has_role(current_user, 'qr_migrator', 'SET') AS migrator_set
  `);
  const acl = privilege.rows[0];
  assert(acl.current_user === "qr_runtime" && acl.schema_usage && acl.table_dml && acl.user_dml && acl.credential_dml && acl.bootstrap_dml && acl.session_dml && acl.settings_select && acl.settings_column_update && acl.sequence_usage, "Runtime lacks intended privileges");
  assert(!acl.settings_table_update && !acl.settings_write_extra && !acl.schema_create && !acl.table_truncate && !acl.table_references && !acl.table_trigger && !acl.table_maintain && !acl.sequence_select && !acl.sequence_update && !acl.migration_access && !acl.migrator_member && !acl.migrator_set, "Runtime has excess privileges");
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

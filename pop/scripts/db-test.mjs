import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import pg from "pg";

import { generateSql, verifyRepository } from "./migration-policy.mjs";

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

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function captureExistingApplicationState(client) {
  const catalog = await client.query(`
    SELECT c.oid::text AS table_oid, c.relname AS table_name,
      a.attnum, a.attname AS column_name, a.atttypid::text AS type_oid,
      a.atttypmod, a.attnotnull
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'app' AND c.relkind = 'r'
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.oid, a.attnum
  `);
  const tables = new Map();
  for (const row of catalog.rows) {
    const table = tables.get(row.table_name) ?? { columns: [], rows: [] };
    table.columns.push(row.column_name);
    tables.set(row.table_name, table);
  }
  for (const [tableName, table] of tables) {
    const values = table.columns.map((columnName) => `t.${quoteIdentifier(columnName)}`).join(", ");
    const rows = await client.query(
      `SELECT jsonb_build_array(${values})::text AS row FROM app.${quoteIdentifier(tableName)} t`,
    );
    table.rows = rows.rows.map(({ row }) => row).sort();
  }
  return { catalog: catalog.rows, tables };
}

async function assertExistingApplicationStatePreserved(client, before) {
  const after = await captureExistingApplicationState(client);
  const afterCatalog = new Set(after.catalog.map((row) => JSON.stringify(row)));
  for (const row of before.catalog) {
    assert(afterCatalog.has(JSON.stringify(row)), `Migration policy changed existing catalog identity/type for ${row.table_name}.${row.column_name}`);
  }
  for (const [tableName, table] of before.tables) {
    const columns = table.columns.map((columnName) => `t.${quoteIdentifier(columnName)}`).join(", ");
    const rows = await client.query(
      `SELECT jsonb_build_array(${columns})::text AS row FROM app.${quoteIdentifier(tableName)} t`,
    );
    assert(
      JSON.stringify(rows.rows.map(({ row }) => row).sort()) === JSON.stringify(table.rows),
      `Migration policy changed existing rows or cells in app.${tableName}`,
    );
  }
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

async function waitForLock(observer, backendPid, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const activity = await observer.query(
      "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
      [backendPid],
    );
    if (activity.rows[0]?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${label} did not wait on a PostgreSQL lock`);
}

const policyResult = await verifyRepository();
console.log(`PASS migration-policy-preflight baseline=${policyResult.baselineCount} future=${policyResult.futureCount}`);

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
  const expectedMigrations = (await readdir("prisma/migrations", { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const firstDeploy = run("pnpm", ["exec", "prisma", "migrate", "deploy"], { env: migrationEnv });
  assert(firstDeploy.includes(`${expectedMigrations.length} migrations found`), "Fresh deploy did not discover the policy-approved migration set");

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const history = await admin.query(`
    SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at
    FROM app._prisma_migrations
  `);
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

  const storefrontColumns = await runtime.query(`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'user' AND column_name LIKE 'storefront%'
    ORDER BY column_name
  `);
  assert(JSON.stringify(storefrontColumns.rows) === JSON.stringify([
    { column_name: "storefront_accent_color", data_type: "character varying", udt_name: "varchar", is_nullable: "YES" },
    { column_name: "storefront_display_name_en", data_type: "character varying", udt_name: "varchar", is_nullable: "YES" },
    { column_name: "storefront_display_name_pt_br", data_type: "character varying", udt_name: "varchar", is_nullable: "YES" },
    { column_name: "storefront_enabled", data_type: "boolean", udt_name: "bool", is_nullable: "NO" },
    { column_name: "storefront_slug", data_type: "character varying", udt_name: "varchar", is_nullable: "YES" },
  ]), "Storefront columns differ from the contract");
  const storefrontDefaults = await runtime.query(`SELECT storefront_slug, storefront_display_name_pt_br, storefront_display_name_en, storefront_accent_color, storefront_enabled FROM app."user" WHERE id = $1`, [otherUserId]);
  assert(JSON.stringify(storefrontDefaults.rows) === JSON.stringify([{ storefront_slug: null, storefront_display_name_pt_br: null, storefront_display_name_en: null, storefront_accent_color: null, storefront_enabled: false }]), "Storefront settings are not disabled and null by default");
  await runtime.query(`UPDATE app."user" SET storefront_slug = 'second-user-store', storefront_display_name_pt_br = 'Loja', storefront_display_name_en = 'Store', storefront_accent_color = '#1A2B3C', storefront_enabled = TRUE WHERE id = $1`, [otherUserId]);
  const storefrontOwnerId = randomUUID();
  await runtime.query(`INSERT INTO app."user" (id, username, role, status) VALUES ($1, 'storefront.user', 'USER', 'ACTIVE')`, [storefrontOwnerId]);
  await expectSqlState(runtime, `UPDATE app."user" SET storefront_slug = 'second-user-store' WHERE id = '${storefrontOwnerId}'`, { code: "23505", constraint: "user_storefront_slug_key" });
  await expectSqlState(runtime, `UPDATE app."user" SET storefront_slug = 'Invalid Slug' WHERE id = '${storefrontOwnerId}'`, { code: "23514", constraint: "user_storefront_slug_format" });
  await expectSqlState(runtime, `UPDATE app."user" SET storefront_slug = '' WHERE id = '${storefrontOwnerId}'`, { code: "23514", constraint: "user_storefront_slug_format" });
  await expectSqlState(runtime, `UPDATE app."user" SET storefront_display_name_pt_br = E'two\nlines' WHERE id = '${storefrontOwnerId}'`, { code: "23514", constraint: "user_storefront_display_name_pt_br_single_line" });
  await expectSqlState(runtime, `UPDATE app."user" SET storefront_display_name_en = E'two\nlines' WHERE id = '${storefrontOwnerId}'`, { code: "23514", constraint: "user_storefront_display_name_en_single_line" });
  await expectSqlState(runtime, `UPDATE app."user" SET storefront_accent_color = '#1a2b3c' WHERE id = '${storefrontOwnerId}'`, { code: "23514", constraint: "user_storefront_accent_color_format" });
  await expectSqlState(runtime, `UPDATE app."user" SET storefront_slug = NULL, storefront_enabled = TRUE WHERE id = '${storefrontOwnerId}'`, { code: "23514", constraint: "user_storefront_enabled_requires_slug" });
  await runtime.query(`UPDATE app."user" SET storefront_slug = NULL, storefront_enabled = FALSE WHERE id = $1`, [otherUserId]);
  await runtime.query(`DELETE FROM app."user" WHERE id = $1`, [storefrontOwnerId]);
  console.log("PASS storefront-settings-schema");

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

  const currencyPairColumns = await runtime.query(`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'catalog_currency_pair'
    ORDER BY ordinal_position
  `);
  assert(JSON.stringify(currencyPairColumns.rows) === JSON.stringify([
    { column_name: "id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "label", data_type: "character varying", udt_name: "varchar", is_nullable: "NO" },
    { column_name: "currency_uuid", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "exchange_currency_uuid", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "active", data_type: "boolean", udt_name: "bool", is_nullable: "NO" },
    { column_name: "created_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
    { column_name: "updated_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
  ]), "Catalog currency pair columns differ from the contract");
  const paymentMethodColumns = await runtime.query(`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'catalog_payment_method'
    ORDER BY ordinal_position
  `);
  assert(JSON.stringify(paymentMethodColumns.rows) === JSON.stringify([
    { column_name: "id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "label", data_type: "character varying", udt_name: "varchar", is_nullable: "NO" },
    { column_name: "payment_method_uuid", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "active", data_type: "boolean", udt_name: "bool", is_nullable: "NO" },
    { column_name: "created_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
    { column_name: "updated_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
  ]), "Catalog payment method columns differ from the contract");
  const currencyPairUuid = randomUUID();
  const exchangeCurrencyUuid = randomUUID();
  const paymentMethodUuid = randomUUID();
  await runtime.query(`INSERT INTO app.catalog_currency_pair (label, currency_uuid, exchange_currency_uuid) VALUES ($1, $2, $3)`, ["BRL/USDT", currencyPairUuid, exchangeCurrencyUuid]);
  await expectSqlState(runtime, `INSERT INTO app.catalog_currency_pair (label, currency_uuid, exchange_currency_uuid) VALUES ('duplicate pair', '${currencyPairUuid}', '${exchangeCurrencyUuid}')`, { code: "23505", constraint: "catalog_currency_pair_uuids_key" });
  await runtime.query(`INSERT INTO app.catalog_payment_method (label, payment_method_uuid) VALUES ($1, $2)`, ["PIX", paymentMethodUuid]);
  await expectSqlState(runtime, `INSERT INTO app.catalog_payment_method (label, payment_method_uuid) VALUES ('duplicate method', '${paymentMethodUuid}')`, { code: "23505", constraint: "catalog_payment_method_uuid_key" });
  await runtime.query(`UPDATE app.catalog_currency_pair SET active = false WHERE currency_uuid = $1`, [currencyPairUuid]);
  await runtime.query(`UPDATE app.catalog_payment_method SET active = false WHERE payment_method_uuid = $1`, [paymentMethodUuid]);
  console.log("PASS catalog-schema");

  const productColumns = await runtime.query(`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'product'
    ORDER BY ordinal_position
  `);
  assert(JSON.stringify(productColumns.rows) === JSON.stringify([
    { column_name: "id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "internal_name", data_type: "character varying", udt_name: "varchar", is_nullable: "NO" },
    { column_name: "title_pt_br", data_type: "character varying", udt_name: "varchar", is_nullable: "NO" },
    { column_name: "title_en", data_type: "character varying", udt_name: "varchar", is_nullable: "NO" },
    { column_name: "description_pt_br", data_type: "character varying", udt_name: "varchar", is_nullable: "NO" },
    { column_name: "description_en", data_type: "character varying", udt_name: "varchar", is_nullable: "NO" },
    { column_name: "price", data_type: "text", udt_name: "text", is_nullable: "NO" },
    { column_name: "active", data_type: "boolean", udt_name: "bool", is_nullable: "NO" },
    { column_name: "version", data_type: "integer", udt_name: "int4", is_nullable: "NO" },
    { column_name: "created_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
    { column_name: "updated_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO" },
    { column_name: "owner_id", data_type: "uuid", udt_name: "uuid", is_nullable: "NO" },
    { column_name: "category_id", data_type: "uuid", udt_name: "uuid", is_nullable: "YES" },
  ]), "Product columns differ from the contract");
  const productConstraints = await runtime.query(`
    SELECT c.conname, pg_get_userbyid(t.relowner) AS owner
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app' AND t.relname = 'product'
    ORDER BY c.conname
  `);
  const productConstraintNames = new Set(productConstraints.rows.map((row) => row.conname));
  for (const name of ["product_pkey", "product_internal_name_bounds", "product_internal_name_single_line", "product_title_pt_br_bounds", "product_title_pt_br_single_line", "product_title_en_bounds", "product_title_en_single_line", "product_description_pt_br_bounds", "product_description_en_bounds", "product_price_canonical", "product_version_nonnegative", "product_owner_fkey", "product_id_owner_id_key", "product_category_owner_fkey"]) {
    assert(productConstraintNames.has(name), `Missing constraint ${name}`);
  }
  assert(productConstraints.rows.every((row) => row.owner === "qr_migrator"), "Runtime owns the product table");

  const product = await runtime.query(`
    INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, price, active, version
  `, ["i".repeat(128), "á".repeat(160), "x".repeat(160), "linha um\n" + "ç".repeat(1991), "line one\n" + "x".repeat(1991), "999999999999.999999", otherUserId]);
  const productId = product.rows[0]?.id;
  assert(typeof productId === "string" && product.rows[0].price === "999999999999.999999", "Product UUID or exact price changed");
  assert(product.rows[0].active === true && product.rows[0].version === 0, "Product defaults changed");
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES (' spaced ', 'Título', 'Title', 'Descrição', 'Description', '1', '${otherUserId}')`, { code: "23514", constraint: "product_internal_name_bounds" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES (E'line\\nbreak', 'Título', 'Title', 'Descrição', 'Description', '1', '${otherUserId}')`, { code: "23514", constraint: "product_internal_name_single_line" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ('valid', E'Título\\nquebrado', 'Title', 'Descrição', 'Description', '1', '${otherUserId}')`, { code: "23514", constraint: "product_title_pt_br_single_line" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ('valid', 'Título', E'Title\\nbroken', 'Descrição', 'Description', '1', '${otherUserId}')`, { code: "23514", constraint: "product_title_en_single_line" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ('valid', 'Título', 'Title', '', 'Description', '1', '${otherUserId}')`, { code: "23514", constraint: "product_description_pt_br_bounds" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ('valid', chr(160) || 'Título', 'Title', 'Descrição', 'Description', '1', '${otherUserId}')`, { code: "23514", constraint: "product_title_pt_br_bounds" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ('valid', 'Título', 'Title' || chr(160), 'Descrição', 'Description', '1', '${otherUserId}')`, { code: "23514", constraint: "product_title_en_bounds" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ('valid', 'Título', 'Title', 'Descrição', chr(12288) || 'Description', '1', '${otherUserId}')`, { code: "23514", constraint: "product_description_en_bounds" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES (repeat('a', 129), 'Título', 'Title', 'Descrição', 'Description', '1', '${otherUserId}')`, { code: "22001" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ('valid', repeat('a', 161), 'Title', 'Descrição', 'Description', '1', '${otherUserId}')`, { code: "22001" });
  await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ('valid', 'Título', 'Title', repeat('a', 2001), 'Description', '1', '${otherUserId}')`, { code: "22001" });
  for (const validPrice of ["0.000001", "1.25", "999999999999"]) {
    const exactPrice = await runtime.query(`INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ($1, 'Título', 'Title', 'Descrição', 'Description', $2, $3) RETURNING id, price`, [`valid-price-${validPrice}`, validPrice, otherUserId]);
    assert(exactPrice.rows[0]?.price === validPrice, `Valid product price ${validPrice} was not preserved exactly`);
    await runtime.query(`DELETE FROM app.product WHERE id = $1`, [exactPrice.rows[0].id]);
  }
  for (const invalidPrice of ["0", "00.1", "01", "1.0", "1.230", "0.0000001", "9999999999999", "-1", "+1", "1e2", "1,2", " 1"] ) {
    await expectSqlState(runtime, `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ('invalid-price', 'Título', 'Title', 'Descrição', 'Description', '${invalidPrice}')`, { code: "23514", constraint: "product_price_canonical" });
  }
  await expectSqlState(runtime, `UPDATE app.product SET version = -1 WHERE id = '${productId}'`, { code: "23514", constraint: "product_version_nonnegative" });
  const staleProductUpdate = await runtime.query(`UPDATE app.product SET price = '2', version = version + 1 WHERE id = $1 AND version = 1`, [productId]);
  assert(staleProductUpdate.rowCount === 0, "Stale product version mutated the row");
  const winningProductUpdate = await runtime.query(`UPDATE app.product SET price = '2', active = false, version = version + 1 WHERE id = $1 AND version = 0 RETURNING price, active, version`, [productId]);
  assert(winningProductUpdate.rows[0]?.price === "2" && winningProductUpdate.rows[0]?.active === false && winningProductUpdate.rows[0]?.version === 1, "Exact product version CAS did not win");
  const staleProductDelete = await runtime.query(`DELETE FROM app.product WHERE id = $1 AND version = 0`, [productId]);
  assert(staleProductDelete.rowCount === 0, "Stale product version deleted the row");
  const winningProductDelete = await runtime.query(`DELETE FROM app.product WHERE id = $1 AND version = 1`, [productId]);
  assert(winningProductDelete.rowCount === 1, "Exact product version delete did not win");
  console.log("PASS product-schema");

  const paymentLinkConstraints = await runtime.query(`
    SELECT c.conname, pg_get_userbyid(t.relowner) AS owner
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app' AND t.relname = 'payment_link'
  `);
  const paymentLinkConstraintNames = new Set(paymentLinkConstraints.rows.map((row) => row.conname));
  for (const name of ["payment_link_pkey", "payment_link_identifier_key", "payment_link_identifier_url_safe", "payment_link_type_closed", "payment_link_owner_fkey", "payment_link_product_owner_fkey", "payment_link_currency_pair_fkey", "payment_link_id_owner_id_key", "payment_link_id_owner_product_id_key"]) {
    assert(paymentLinkConstraintNames.has(name), `Missing constraint ${name}`);
  }
  assert(paymentLinkConstraints.rows.every((row) => row.owner === "qr_migrator"), "Runtime owns the payment-link table");

  async function createActiveLinkDependencies(label) {
    const product = await runtime.query(
      `INSERT INTO app.product (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id) VALUES ($1, 'Título', 'Title', 'Descrição', 'Description', '10.25', $2) RETURNING id`,
      [`payment-link-${label}-${randomUUID()}`, otherUserId],
    );
    const pair = await runtime.query(
      `INSERT INTO app.catalog_currency_pair (label, currency_uuid, exchange_currency_uuid) VALUES ($1, $2, $3) RETURNING id`,
      [`pair-${label}`, randomUUID(), randomUUID()],
    );
    return { productId: product.rows[0].id, currencyPairId: pair.rows[0].id };
  }

  async function insertPaymentLink(client, productId, currencyPairId, identifier = randomUUID().replaceAll("-", "").slice(0, 24)) {
    return client.query(
      `INSERT INTO app.payment_link (identifier, owner_id, product_id, currency_pair_id, link_type) VALUES ($1, $2, $3, $4, 'REUSABLE') RETURNING id`,
      [identifier, otherUserId, productId, currencyPairId],
    );
  }

  const linkDependencies = await createActiveLinkDependencies("constraints");
  await insertPaymentLink(runtime, linkDependencies.productId, linkDependencies.currencyPairId, "AbCdEfGhIjKlMnOpQrStUvWx");
  await expectSqlState(runtime, `INSERT INTO app.payment_link (identifier, owner_id, product_id, currency_pair_id, link_type) VALUES ('not url safe!', '${otherUserId}', '${linkDependencies.productId}', '${linkDependencies.currencyPairId}', 'REUSABLE')`, { code: "23514", constraint: "payment_link_identifier_url_safe" });
  await expectSqlState(runtime, `INSERT INTO app.payment_link (identifier, owner_id, product_id, currency_pair_id, link_type) VALUES ('ZbCdEfGhIjKlMnOpQrStUvWx', '${otherUserId}', '${linkDependencies.productId}', '${linkDependencies.currencyPairId}', 'UNLIMITED')`, { code: "23514", constraint: "payment_link_type_closed" });

  const creationClient = new Client({ connectionString: runtimeUrl });
  const deactivationClient = new Client({ connectionString: runtimeUrl });
  await creationClient.connect();
  await deactivationClient.connect();
  const creationPid = (await creationClient.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
  const deactivationPid = (await deactivationClient.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

  for (const dependency of ["product", "currency_pair"]) {
    const dependencies = await createActiveLinkDependencies(`create-first-${dependency}`);
    await creationClient.query("BEGIN");
    await insertPaymentLink(creationClient, dependencies.productId, dependencies.currencyPairId);
    const update = dependency === "product"
      ? deactivationClient.query("UPDATE app.product SET active = FALSE WHERE id = $1", [dependencies.productId])
      : deactivationClient.query("UPDATE app.catalog_currency_pair SET active = FALSE WHERE id = $1", [dependencies.currencyPairId]);
    await waitForLock(admin, deactivationPid, `${dependency} deactivation behind link insert`);
    await creationClient.query("COMMIT");
    await update;
  }

  for (const dependency of ["product", "currency_pair"]) {
    const dependencies = await createActiveLinkDependencies(`deactivate-first-${dependency}`);
    await deactivationClient.query("BEGIN");
    if (dependency === "product") {
      await deactivationClient.query("UPDATE app.product SET active = FALSE WHERE id = $1", [dependencies.productId]);
    } else {
      await deactivationClient.query("UPDATE app.catalog_currency_pair SET active = FALSE WHERE id = $1", [dependencies.currencyPairId]);
    }
    await creationClient.query("BEGIN");
    const insert = insertPaymentLink(creationClient, dependencies.productId, dependencies.currencyPairId);
    await waitForLock(admin, creationPid, `link insert behind ${dependency} deactivation`);
    await deactivationClient.query("COMMIT");
    try {
      await insert;
      throw new Error(`Link insert unexpectedly succeeded after ${dependency} deactivation`);
    } catch (error) {
      assert(error?.code === "23514", `Expected ${dependency} dependency failure, got ${error?.code}`);
      assert(error?.constraint === (dependency === "product" ? "payment_link_product_active" : "payment_link_currency_pair_active"), `Unexpected dependency constraint ${error?.constraint}`);
    } finally {
      await creationClient.query("ROLLBACK");
    }
    const remaining = await runtime.query("SELECT count(*)::int AS count FROM app.payment_link WHERE product_id = $1 AND currency_pair_id = $2", [dependencies.productId, dependencies.currencyPairId]);
    assert(remaining.rows[0].count === 0, `Failed ${dependency} link insert persisted a row`);
  }
  await creationClient.end();
  await deactivationClient.end();
  console.log("PASS payment-link-schema-and-locking");

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

  const mediaOwnerId = randomUUID();
  const mediaId = randomUUID();
  const mediaIdentifier = randomBytes(32).toString("base64url");
  const mediaStorageKey = randomBytes(32).toString("base64url");
  await runtime.query(`INSERT INTO app."user" (id, username, email, role, status) VALUES ($1, 'media.owner', NULL, 'USER', 'ACTIVE')`, [mediaOwnerId]);
  const mediaInsert = `
    INSERT INTO app.media_object
      (id, identifier, storage_key, owner_id, purpose, state, lifecycle_revision, mime_type, byte_size, width, height, sha256, purge_after, created_at, updated_at)
    VALUES
      ('${mediaId}', '${mediaIdentifier}', '${mediaStorageKey}', '${mediaOwnerId}', 'PRODUCT_IMAGE', 'STAGED', 0, 'image/webp', 4, 1, 1, '${"a".repeat(64)}', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `;
  await runtime.query(mediaInsert);
  await expectSqlState(runtime, mediaInsert.replace("'PRODUCT_IMAGE'", "'UNSAFE'").replace(`'${mediaId}'`, `'${randomUUID()}'`).replace(`'${mediaIdentifier}'`, `'${randomBytes(32).toString("base64url")}'`).replace(`'${mediaStorageKey}'`, `'${randomBytes(32).toString("base64url")}'`), { code: "23514", constraint: "media_object_purpose_closed" });
  await expectSqlState(runtime, `UPDATE app.media_object SET lifecycle_revision = -1 WHERE id = '${mediaId}'`, { code: "23514", constraint: "media_object_revision_nonnegative" });
  await expectSqlState(runtime, `UPDATE app.media_object SET byte_size = 0 WHERE id = '${mediaId}'`, { code: "23514", constraint: "media_object_canonical_limits" });
  await expectSqlState(runtime, `UPDATE app.media_object SET state = 'ORPHANED' WHERE id = '${mediaId}'`, { code: "23514", constraint: "media_object_purge_consistent" });
  const staleMedia = await runtime.query(`UPDATE app.media_object SET state = 'ACTIVE', lifecycle_revision = lifecycle_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND owner_id = $2 AND purpose = 'PRODUCT_IMAGE' AND state = 'STAGED' AND lifecycle_revision = 1`, [mediaId, mediaOwnerId]);
  assert(staleMedia.rowCount === 0, "Stale media lifecycle revision mutated the row");
  const activeMedia = await runtime.query(`UPDATE app.media_object SET state = 'ACTIVE', lifecycle_revision = lifecycle_revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND owner_id = $2 AND purpose = 'PRODUCT_IMAGE' AND state = 'STAGED' AND lifecycle_revision = 0 RETURNING lifecycle_revision`, [mediaId, mediaOwnerId]);
  assert(activeMedia.rows[0]?.lifecycle_revision === "1" || activeMedia.rows[0]?.lifecycle_revision === 1, "Exact media lifecycle revision did not win");
  await runtime.query(`DELETE FROM app.media_object WHERE id = $1`, [mediaId]);
  await runtime.query(`DELETE FROM app."user" WHERE id = $1`, [mediaOwnerId]);
  console.log("PASS media-object-schema");

  const categoryOwnerId = randomUUID();
  const categoryOtherOwnerId = randomUUID();
  const categoryId = randomUUID();
  const replacementCategoryId = randomUUID();
  await runtime.query(
    `INSERT INTO app."user" (id, username, email, role, status)
     VALUES ($1, 'category.owner', NULL, 'USER', 'ACTIVE'),
            ($2, 'category.other', NULL, 'USER', 'ACTIVE')`,
    [categoryOwnerId, categoryOtherOwnerId],
  );
  const uncategorizedBefore = await runtime.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE category_id IS NOT NULL)::int AS categorized
     FROM app.product`,
  );
  assert(uncategorizedBefore.rows[0].categorized === 0, "Additive category migration backfilled an existing product");
  await runtime.query(
    `INSERT INTO app.product_category
       (id, owner_id, name_pt_br, name_en, active, version, created_at, updated_at)
     VALUES
       ($1, $2, 'Doações', 'Donations', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       ($3, $2, 'Cursos', 'Courses', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [categoryId, categoryOwnerId, replacementCategoryId],
  );
  await expectSqlState(
    runtime,
    `INSERT INTO app.product_category
       (id, owner_id, name_pt_br, name_en, active, version, created_at, updated_at)
     VALUES
       ('${randomUUID()}', '${categoryOwnerId}', 'Doações', 'Giving', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    { code: "23505", constraint: "product_category_owner_name_pt_br_key" },
  );
  await expectSqlState(
    runtime,
    `INSERT INTO app.product_category
       (id, owner_id, name_pt_br, name_en, active, version, created_at, updated_at)
     VALUES
       ('${randomUUID()}', '${categoryOwnerId}', 'Giving', 'Donations', TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    { code: "23505", constraint: "product_category_owner_name_en_key" },
  );
  await expectSqlState(
    runtime,
    `UPDATE app.product_category SET version = -1 WHERE id = '${categoryId}'`,
    { code: "23514", constraint: "product_category_version_nonnegative" },
  );
  const categoryProduct = await runtime.query(
    `INSERT INTO app.product
       (internal_name, title_pt_br, title_en, description_pt_br, description_en, price, owner_id, category_id)
     VALUES
       ('category-product', 'Produto', 'Product', 'Descrição', 'Description', '10', $1, $2)
     RETURNING id`,
    [categoryOwnerId, categoryId],
  );
  await expectSqlState(
    runtime,
    `UPDATE app.product SET owner_id = '${categoryOtherOwnerId}' WHERE id = '${categoryProduct.rows[0].id}'`,
    { code: "23503", constraint: "product_category_owner_fkey" },
  );
  await expectSqlState(
    runtime,
    `DELETE FROM app.product_category WHERE id = '${categoryId}'`,
    { code: "23503", constraint: "product_category_owner_fkey" },
  );
  await expectSqlState(
    runtime,
    `DELETE FROM app."user" WHERE id = '${categoryOwnerId}'`,
    { code: "23503" },
  );
  const categoryCasWinner = await runtime.query(
    `UPDATE app.product_category
     SET name_en = 'Contributions', version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND owner_id = $2 AND active = TRUE AND version = 0`,
    [categoryId, categoryOwnerId],
  );
  const categoryCasStale = await runtime.query(
    `UPDATE app.product_category
     SET name_en = 'Stale', version = version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND owner_id = $2 AND active = TRUE AND version = 0`,
    [categoryId, categoryOwnerId],
  );
  assert(categoryCasWinner.rowCount === 1 && categoryCasStale.rowCount === 0, "Category expected-version CAS is not exclusive");
  await runtime.query(`UPDATE app.product SET category_id = $1 WHERE id = $2`, [replacementCategoryId, categoryProduct.rows[0].id]);
  await runtime.query(`UPDATE app.product_category SET active = FALSE, version = version + 1 WHERE id = $1`, [categoryId]);
  const reassigned = await runtime.query(`SELECT category_id FROM app.product WHERE id = $1`, [categoryProduct.rows[0].id]);
  assert(reassigned.rows[0]?.category_id === replacementCategoryId, "Category reassignment changed or lost the product bridge");
  await runtime.query(`DELETE FROM app.product WHERE id = $1`, [categoryProduct.rows[0].id]);
  await runtime.query(`DELETE FROM app.product_category WHERE owner_id = $1`, [categoryOwnerId]);
  await runtime.query(`DELETE FROM app."user" WHERE id IN ($1, $2)`, [categoryOwnerId, categoryOtherOwnerId]);
  console.log("PASS product-category-schema");

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
      has_table_privilege(current_user, 'app.catalog_currency_pair', 'SELECT,INSERT,UPDATE,DELETE') AS catalog_currency_pair_dml,
      has_table_privilege(current_user, 'app.catalog_payment_method', 'SELECT,INSERT,UPDATE,DELETE') AS catalog_payment_method_dml,
      has_table_privilege(current_user, 'app.product', 'SELECT,INSERT,UPDATE,DELETE') AS product_dml,
      has_table_privilege(current_user, 'app.product_category', 'SELECT,INSERT,UPDATE,DELETE') AS product_category_dml,
      has_table_privilege(current_user, 'app.payment_link', 'SELECT,INSERT,UPDATE,DELETE') AS payment_link_dml,
      has_table_privilege(current_user, 'app.media_object', 'SELECT,INSERT,UPDATE,DELETE') AS media_object_dml,
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
      has_table_privilege(current_user, 'app.product', 'TRUNCATE,REFERENCES,TRIGGER') AS product_excess,
      has_table_privilege(current_user, 'app.product_category', 'TRUNCATE,REFERENCES,TRIGGER') AS product_category_excess,
      has_table_privilege(current_user, 'app.payment_link', 'TRUNCATE,REFERENCES,TRIGGER') AS payment_link_excess,
      has_table_privilege(current_user, 'app.media_object', 'TRUNCATE,REFERENCES,TRIGGER') AS media_object_excess,
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
  assert(acl.current_user === "qr_runtime" && acl.schema_usage && acl.table_dml && acl.user_dml && acl.credential_dml && acl.bootstrap_dml && acl.session_dml && acl.nautt_credential_dml && acl.provider_quote_dml && acl.provider_order_dml && acl.webhook_delivery_dml && acl.webhook_attempt_dml && acl.webhook_recovery_lease_dml && acl.catalog_currency_pair_dml && acl.catalog_payment_method_dml && acl.product_dml && acl.product_category_dml && acl.payment_link_dml && acl.media_object_dml && acl.settings_select && acl.settings_column_update && acl.sequence_usage && acl.webhook_sequence_usage, "Runtime lacks intended privileges");
  assert(!acl.settings_table_update && !acl.settings_write_extra && !acl.schema_create && !acl.table_truncate && !acl.table_references && !acl.table_trigger && !acl.provider_order_excess && !acl.webhook_delivery_excess && !acl.webhook_recovery_lease_excess && !acl.product_excess && !acl.product_category_excess && !acl.payment_link_excess && !acl.media_object_excess && !acl.table_maintain && !acl.sequence_select && !acl.sequence_update && !acl.migration_access && !acl.migrator_member && !acl.migrator_set, "Runtime has excess privileges");
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
  await expectDenied(runtime, `TRUNCATE TABLE app.product`);
  await expectDenied(runtime, `CREATE TEMP TABLE runtime_forbidden (id integer)`);
  await expectDenied(runtime, `CREATE ROLE runtime_forbidden`);
  await expectDenied(runtime, `SET ROLE qr_migrator`);
  console.log("PASS runtime-denials");

  await runtime.query(`INSERT INTO app._database_foundation_fixture (key, quantity) VALUES ('policy-preservation', 42)`);
  const stateBeforePolicyMigration = await captureExistingApplicationState(admin);
  const policyManifest = JSON.parse(await readFile("pop/scripts/fixtures/migration-policy/all-operations.safe.json", "utf8"));
  const policyMigrator = new Client({ connectionString: migratorUrl });
  await policyMigrator.connect();
  await policyMigrator.query(generateSql(policyManifest));
  await policyMigrator.end();
  await assertExistingApplicationStatePreserved(admin, stateBeforePolicyMigration);
  const policyColumns = await admin.query(`
    SELECT policy_note, policy_enabled
    FROM app._database_foundation_fixture
    WHERE key = 'policy-preservation'
  `);
  assert(
    JSON.stringify(policyColumns.rows) === JSON.stringify([{ policy_note: null, policy_enabled: false }]),
    "Generated add-column operations did not preserve an existing row with safe new values",
  );
  console.log("PASS migration-policy-postgresql-preservation");

  await runtime.end();
  await admin.end();
} finally {
  cleanup();
}

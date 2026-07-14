import pg from "pg";
import { readFile } from "node:fs/promises";

import { normalizeOptionalEmail, normalizeUsername, validatePassword } from "../src/auth/identity.ts";
import { hashPassword } from "../src/auth/password.ts";
import { databaseUrl, readSecret, safeFailure } from "./lib.mjs";

const { Client } = pg;
const mode = process.argv[2];

async function readOneLine(path, validator) {
  const value = await readSecret(path);
  if (/[\r\n\0]/.test(value)) throw new Error("invalid identity input");
  return validator(value);
}

async function readOptionalEmail(path) {
  const raw = await readFile(path, "utf8");
  if (raw === "") return null;
  if (!raw.endsWith("\n") || /[\0\r\n]/.test(raw.slice(0, -1)) || raw.slice(0, -1).includes("\n")) {
    throw new Error("invalid identity input");
  }
  return normalizeOptionalEmail(raw.slice(0, -1));
}

async function withIdentityLock(operation) {
  const runtimePassword = await readSecret("/run/secrets/runtime_password");
  const client = new Client({ connectionString: databaseUrl({ username: "qr_runtime", password: runtimePassword }) });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1202001)");
    await operation(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function seed() {
  const username = await readOneLine("/run/secrets/initial_admin_username", normalizeUsername);
  const email = await readOptionalEmail("/run/secrets/initial_admin_email");
  const password = await readOneLine("/run/secrets/initial_admin_password", validatePassword);
  const passwordHash = await hashPassword(password);
  await withIdentityLock(async (client) => {
    const locator = await client.query(`SELECT initial_admin_user_id FROM app.deployment_bootstrap WHERE id = 1`);
    const users = await client.query(`SELECT count(*)::int AS count FROM app."user"`);
    if (locator.rowCount === 0) {
      if (users.rows[0].count !== 0) throw new Error("identity seed state is ambiguous");
      const inserted = await client.query(
        `INSERT INTO app."user" (username, email, role, status) VALUES ($1, $2, 'ADMIN', 'ACTIVE') RETURNING id`,
        [username, email],
      );
      const userId = inserted.rows[0].id;
      await client.query(`INSERT INTO app.password_credential (user_id, password_hash) VALUES ($1, $2)`, [userId, passwordHash]);
      await client.query(`INSERT INTO app.deployment_bootstrap (id, initial_admin_user_id) VALUES (1, $1)`, [userId]);
      return;
    }
    if (locator.rowCount !== 1) throw new Error("identity seed state is ambiguous");
    const target = await client.query(
      `SELECT u.id FROM app."user" u JOIN app.password_credential c ON c.user_id = u.id WHERE u.id = $1`,
      [locator.rows[0].initial_admin_user_id],
    );
    if (target.rowCount !== 1) throw new Error("initial identity is unavailable");
  });
  console.log("PASS identity-seed");
}

async function recoverInitialAdmin() {
  const password = await readOneLine("/run/secrets/initial_admin_recovery_password", validatePassword);
  const passwordHash = await hashPassword(password);
  await withIdentityLock(async (client) => {
    const locator = await client.query(`SELECT initial_admin_user_id FROM app.deployment_bootstrap WHERE id = 1`);
    if (locator.rowCount !== 1) throw new Error("initial identity is unavailable");
    const userId = locator.rows[0].initial_admin_user_id;
    const user = await client.query(
      `UPDATE app."user" SET role = 'ADMIN', status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`,
      [userId],
    );
    if (user.rowCount !== 1) throw new Error("initial identity is unavailable");
    const credential = await client.query(
      `UPDATE app.password_credential SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 RETURNING user_id`,
      [userId, passwordHash],
    );
    if (credential.rowCount !== 1) throw new Error("initial identity is unavailable");
  });
  console.log("PASS initial-admin-recovery");
}

const operation = mode === "seed" ? seed : mode === "recover-initial-admin" ? recoverInitialAdmin : undefined;
if (!operation) safeFailure("identity-admin", Object.assign(new Error("invalid mode"), { code: "MODE" }));
else operation().catch((error) => safeFailure("identity-admin", error));

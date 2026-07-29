import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

function execute(command, args, options = {}) { return spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", ...options }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const token = randomUUID().replaceAll("-", "").slice(0, 12);
const project = `qrrp${process.pid}${token}`.toLowerCase();
const temporary = await mkdtemp(path.join(tmpdir(), `${project}-`));
const sources = path.join(temporary, "sources");
const staged = path.join(temporary, "staged");
await mkdir(sources, { mode: 0o700 });
const values = { admin: `Adm!n-${token}`, migrator: `Migrator-${token}`, runtime: `Runtime-${token}`, initial: `Initial-Admin-${token}-Password` };
const nauttEncryptionKey = randomBytes(32).toString("base64url");
const sensitiveValues = [...Object.values(values), nauttEncryptionKey];
const files = Object.fromEntries(Object.keys(values).map((name) => [name, path.join(sources, name)]));
for (const name of Object.keys(values)) { await writeFile(files[name], `${values[name]}\n`, { mode: 0o600 }); await chmod(files[name], 0o600); }
const usernameFile = path.join(sources, "initial-username");
const emailFile = path.join(sources, "initial-email");
const recoveryFile = path.join(sources, "recovery");
await writeFile(usernameFile, "admin.user\n", { mode: 0o600 });
await writeFile(emailFile, "admin@example.com\n", { mode: 0o600 });
await writeFile(recoveryFile, `Recovery-${token}-Password\n`, { mode: 0o600 });
const smtpFiles = {
  SMTP_HOST_FILE: path.join(sources, "smtp_host"),
  SMTP_PORT_FILE: path.join(sources, "smtp_port"),
  SMTP_USER_FILE: path.join(sources, "smtp_user"),
  SMTP_PASSWORD_FILE: path.join(sources, "smtp_password"),
  SMTP_FROM_FILE: path.join(sources, "smtp_from"),
  SMTP_TLS_MODE_FILE: path.join(sources, "smtp_tls_mode"),
  PUBLIC_ORIGIN_FILE: path.join(sources, "public_origin"),
};
await writeFile(smtpFiles.SMTP_HOST_FILE, "smtp.example.com\n", { mode: 0o600 });
await writeFile(smtpFiles.SMTP_PORT_FILE, "587\n", { mode: 0o600 });
await writeFile(smtpFiles.SMTP_USER_FILE, "noreply@example.com\n", { mode: 0o600 });
await writeFile(smtpFiles.SMTP_PASSWORD_FILE, `SMTP-${token}-Password\n`, { mode: 0o600 });
await writeFile(smtpFiles.SMTP_FROM_FILE, "noreply@example.com\n", { mode: 0o600 });
await writeFile(smtpFiles.SMTP_TLS_MODE_FILE, "starttls\n", { mode: 0o600 });
await writeFile(smtpFiles.PUBLIC_ORIGIN_FILE, "https://evidence.invalid\n", { mode: 0o600 });
for (const file of Object.values(smtpFiles)) await chmod(file, 0o600);
const env = {
  ...process.env,
  APP_PORT: "0",
  POSTGRES_ADMIN_PASSWORD_FILE: files.admin,
  MIGRATOR_PASSWORD_FILE: files.migrator,
  RUNTIME_PASSWORD_FILE: files.runtime,
  INITIAL_ADMIN_USERNAME_FILE: usernameFile,
  INITIAL_ADMIN_EMAIL_FILE: emailFile,
  INITIAL_ADMIN_PASSWORD_FILE: files.initial,
  INITIAL_ADMIN_RECOVERY_PASSWORD_FILE: path.join(staged, "initial_admin_recovery_password"),
  NAUTT_WEBHOOK_CALLBACK_URL: "https://evidence.invalid/api/nautt/webhooks",
  STAGED_SECRETS_DIR: staged,
  ...smtpFiles,
};
const compose = (args) => execute("docker", ["compose", "-p", project, "-f", "compose.yaml", ...args], { env });

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashPassword(plaintext) {
  const salt = randomBytes(16);
  const key = scryptSync(plaintext, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 268435456 });
  return `scrypt$v=1$N=131072,r=8,p=1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

function evidenceDatabase(args, input) {
  const container = execute("docker", [
    "ps", "-q",
    "--filter", `label=com.docker.compose.project=${project}`,
    "--filter", "label=com.docker.compose.service=db",
  ]).stdout.trim();
  assert(container, "reset-password evidence database container was not found");
  return execute("docker", [
    "exec", "-i", container,
    "psql", "-U", "postgres", "-d", "qr_pagamentos", "-p", "5433", "-v", "ON_ERROR_STOP=1", "--quiet", ...args,
  ], { input, encoding: "utf8" });
}

let failure;
try {
  const prepared = execute(process.execPath, ["pop/scripts/container-prepare-secrets.mjs"], { env });
  assert(prepared.status === 0, `secret preparation failed\n${prepared.stderr}`);
  const nauttEncryptionKeyFile = path.join(staged, "nautt_encryption_key");
  await writeFile(nauttEncryptionKeyFile, nauttEncryptionKey, { mode: 0o400 });
  await chmod(nauttEncryptionKeyFile, 0o400);
  const totpEncryptionKeyFile = path.join(staged, "totp_encryption_key");
  await writeFile(totpEncryptionKeyFile, nauttEncryptionKey, { mode: 0o400 });
  await chmod(totpEncryptionKeyFile, 0o400);
  await copyFile(recoveryFile, env.INITIAL_ADMIN_RECOVERY_PASSWORD_FILE);
  await chmod(env.INITIAL_ADMIN_RECOVERY_PASSWORD_FILE, 0o400);
  const started = compose(["up", "-d", "--build"]);
  assert(started.status === 0, `reset-password evidence Compose start failed\n${started.stdout}${started.stderr}`);
  const appId = compose(["ps", "-q", "app"]).stdout.trim();
  assert(appId, "reset-password evidence app container was not created");
  let healthy = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const inspected = execute("docker", ["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", appId]);
    if (inspected.stdout.trim() === "healthy") { healthy = true; break; }
    if (["exited", "unhealthy"].includes(inspected.stdout.trim())) throw new Error(`reset-password evidence app became ${inspected.stdout.trim()}`);
    await delay(1000);
  }
  assert(healthy, "reset-password evidence app health timeout");
  const mapping = compose(["port", "app", "3000"]).stdout.trim();
  const port = Number(mapping.match(/:(\d+)$/)?.[1]);
  assert(port, "reset-password evidence loopback port could not be resolved");

  // Seed a merchant user with a password credential and one unconsumed reset token per locale.
  const merchantId = randomUUID();
  const merchantUsername = `reset.evidence.${token}`;
  const resetTokenPtBr = randomBytes(32).toString("base64url");
  const resetTokenEn = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const seedSql = [
    `INSERT INTO app."user" (id, username, email, role, status, created_at, updated_at)`,
    `VALUES ('${merchantId}', '${merchantUsername}', '${merchantUsername}@example.com', 'USER', 'ACTIVE', '${now}', '${now}')`,
    `ON CONFLICT (username) DO UPDATE SET deleted_at = NULL, status = 'ACTIVE'`,
    `;`,
    `INSERT INTO app.password_credential (user_id, password_hash, created_at, updated_at)`,
    `VALUES ('${merchantId}', '${hashPassword(`Initial-${token}`).replace(/'/g, "''")}', '${now}', '${now}')`,
    `ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    `;`,
    `DELETE FROM app.password_reset_token WHERE user_id = '${merchantId}'`,
    `;`,
    `INSERT INTO app.password_reset_token (id, user_id, token_digest, expires_at, created_at) VALUES`,
    `(gen_random_uuid(), '${merchantId}', '${sha256(resetTokenPtBr)}', '${expiresAt}', '${now}'),`,
    `(gen_random_uuid(), '${merchantId}', '${sha256(resetTokenEn)}', '${expiresAt}', '${now}')`,
    `;`,
  ].join("\n");
  const seeded = evidenceDatabase([], seedSql);
  assert(seeded.status === 0, `reset-password evidence database seed failed\n${seeded.stdout}\n${seeded.stderr}`);
  console.log(`Seeded reset-password evidence user ${merchantId}`);

  const playwright = spawn(path.join(process.cwd(), "node_modules/.bin/playwright"), ["test", "tests/reset-password.evidence.spec.ts", "--project=chromium", "--workers=1"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_EVIDENCE_BASE_URL: `http://127.0.0.1:${port}`,
      RESET_PASSWORD_EVIDENCE_BASE_URL: `http://127.0.0.1:${port}`,
      RESET_PASSWORD_EVIDENCE_TOKEN_PT_BR: resetTokenPtBr,
      RESET_PASSWORD_EVIDENCE_TOKEN_EN: resetTokenEn,
      RESET_PASSWORD_EVIDENCE_USER_ID: merchantId,
    },
    stdio: "inherit",
  });
  const status = await new Promise((resolve, reject) => { playwright.on("error", reject); playwright.on("exit", resolve); });
  if (status !== 0) {
    const logs = compose(["logs", "--no-color", "app"]);
    let redacted = `${logs.stdout}${logs.stderr}`;
    for (const value of sensitiveValues) redacted = redacted.replaceAll(value, "[REDACTED]");
    console.error(redacted);
  }
  assert(status === 0, `reset-password evidence Playwright failed with status ${status}`);
} catch (error) {
  failure = error;
} finally {
  const cleanup = compose(["down", "--volumes", "--remove-orphans", "--rmi", "local"]);
  await rm(temporary, { recursive: true, force: true });
  if (cleanup.status !== 0 && !failure) failure = new Error(`reset-password evidence Compose cleanup failed\n${cleanup.stdout}${cleanup.stderr}`);
}
if (failure) throw failure;

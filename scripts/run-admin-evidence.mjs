import { randomBytes, randomUUID } from "node:crypto";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

function execute(command, args, options = {}) { return spawnSync(command, args, { cwd: process.cwd(), encoding: "utf8", ...options }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const token = randomUUID().replaceAll("-", "").slice(0, 12);
const appShellMode = process.argv.includes("--app-shell");
const profileMode = process.argv.includes("--profile");
const project = `qrae${process.pid}${token}`.toLowerCase();
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
};
const compose = (args) => execute("docker", ["compose", "-p", project, "-f", "compose.yaml", ...args], { env });

let failure;
try {
  const prepared = execute(process.execPath, ["pop/scripts/container-prepare-secrets.mjs"], { env });
  assert(prepared.status === 0, `secret preparation failed\n${prepared.stderr}`);
  const nauttEncryptionKeyFile = path.join(staged, "nautt_encryption_key");
  await writeFile(nauttEncryptionKeyFile, nauttEncryptionKey, { mode: 0o400 });
  await chmod(nauttEncryptionKeyFile, 0o400);
  await copyFile(recoveryFile, env.INITIAL_ADMIN_RECOVERY_PASSWORD_FILE);
  await chmod(env.INITIAL_ADMIN_RECOVERY_PASSWORD_FILE, 0o400);
  const started = compose(["up", "-d", "--build"]);
  assert(started.status === 0, `admin evidence Compose start failed\n${started.stdout}${started.stderr}`);
  const appId = compose(["ps", "-q", "app"]).stdout.trim();
  assert(appId, "admin evidence app container was not created");
  let healthy = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const inspected = execute("docker", ["inspect", "--format", "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}", appId]);
    if (inspected.stdout.trim() === "healthy") { healthy = true; break; }
    if (["exited", "unhealthy"].includes(inspected.stdout.trim())) throw new Error(`admin evidence app became ${inspected.stdout.trim()}`);
    await delay(1000);
  }
  assert(healthy, "admin evidence app health timeout");
  const mapping = compose(["port", "app", "3000"]).stdout.trim();
  const port = Number(mapping.match(/:(\d+)$/)?.[1]);
  assert(port, "admin evidence loopback port could not be resolved");
  const evidenceTest = profileMode
    ? "tests/profile.evidence.spec.ts"
    : appShellMode
      ? "tests/app-shell.evidence.spec.ts"
      : "tests/admin.evidence.spec.ts";
  const playwright = spawn(path.join(process.cwd(), "node_modules/.bin/playwright"), ["test", evidenceTest, "--project=chromium", "--workers=1"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_EVIDENCE_BASE_URL: `http://127.0.0.1:${port}`,
      ADMIN_EVIDENCE_USERNAME: "admin.user",
      ADMIN_EVIDENCE_PASSWORD: values.initial,
      APP_SHELL_EVIDENCE_MERCHANT_PASSWORD: `Merchant-${token}-Password`,
      PROFILE_EVIDENCE_MERCHANT_PASSWORD: `Merchant-${token}-Password`,
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
  assert(status === 0, `admin evidence Playwright failed with status ${status}`);
} catch (error) {
  failure = error;
} finally {
  const cleanup = compose(["down", "--volumes", "--remove-orphans", "--rmi", "local"]);
  await rm(temporary, { recursive: true, force: true });
  if (cleanup.status !== 0 && !failure) failure = new Error(`admin evidence Compose cleanup failed\n${cleanup.stdout}${cleanup.stderr}`);
}
if (failure) throw failure;

import { spawn } from "node:child_process";
import pg from "pg";
import { assertEncryptionKeyShape, databaseUrl, readOptionalSecret, readSecret, safeFailure } from "./lib.mjs";
import { MEDIA_STORAGE_ROOT, preflightMediaStorage } from "./media-preflight.mjs";

const { Client } = pg;

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function loopbackAllowanceGranted() {
  return (process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS ?? "").trim() === "1";
}

/**
 * Restates the single production decision in src/net/local-origin.ts because
 * this startup wrapper cannot import a TypeScript module; keep both in sync.
 * Never interpolates the configured origin value into a thrown message.
 */
function assertProductionOperatorOrigin(url, variableName) {
  if (url.username || url.password || url.hash) {
    throw new Error(`invalid ${variableName} configuration`);
  }
  if (url.protocol === "https:") return;
  if (url.protocol !== "http:" || !LOOPBACK_HOSTNAMES.has(url.hostname)) {
    throw new Error(`invalid ${variableName} configuration`);
  }
  if (!loopbackAllowanceGranted()) {
    throw new Error(`${variableName} is a loopback HTTP origin; set ALLOW_LOOPBACK_OPERATOR_ORIGINS=1 to allow it`);
  }
}

async function readPublicOriginRaw() {
  const filePath = process.env.PUBLIC_ORIGIN_FILE;
  if (filePath) return readSecret(filePath);
  return process.env.PUBLIC_ORIGIN;
}

async function main() {
  if (process.env.MEDIA_STORAGE_ROOT !== MEDIA_STORAGE_ROOT) {
    throw Object.assign(new Error("invalid media root"), { code: "MEDIAROOT" });
  }
  await preflightMediaStorage();
  console.log("PASS runtime-media-preflight");
  const callbackUrl = new URL(process.env.NAUTT_WEBHOOK_CALLBACK_URL ?? "invalid:");
  assertProductionOperatorOrigin(callbackUrl, "NAUTT_WEBHOOK_CALLBACK_URL");
  let publicOriginUrl;
  try {
    publicOriginUrl = new URL((await readPublicOriginRaw()) ?? "invalid:");
  } catch {
    throw new Error("invalid PUBLIC_ORIGIN configuration");
  }
  assertProductionOperatorOrigin(publicOriginUrl, "PUBLIC_ORIGIN");
  const password = await readSecret("/run/secrets/runtime_password");
  const preflightUrl = databaseUrl({ username: "qr_runtime", password });
  const applicationUrl = databaseUrl({ username: "qr_runtime", password, schema: true });
  const client = new Client({ connectionString: preflightUrl });
  await client.connect();
  try {
    const result = await client.query("SELECT 1 AS ready");
    if (result.rows[0]?.ready !== 1) throw new Error("unexpected preflight result");
  } finally {
    await client.end();
  }
  console.log("PASS runtime-db-preflight");
  const nauttEncryptionKey = await readSecret("/run/secrets/nautt_encryption_key");
  const totpEncryptionKey = await readSecret("/run/secrets/totp_encryption_key");
  const env = { ...process.env, DATABASE_URL: applicationUrl, NAUTT_ENCRYPTION_KEY: nauttEncryptionKey, TOTP_ENCRYPTION_KEY: totpEncryptionKey, NAUTT_WEBHOOK_CALLBACK_URL: callbackUrl.toString() };
  delete env.MIGRATION_DATABASE_URL;
  // Rotation window: the optional previous key is injected only when its
  // secret file exists and is non-empty, validated with the same 32-byte
  // base64url shape as the current keys. Absent reproduces today's behavior
  // exactly (env var stays unset); present but malformed fails loudly here,
  // before the application child ever spawns.
  const nauttPreviousEncryptionKey = await readOptionalSecret("/run/secrets/nautt_encryption_key_previous");
  if (nauttPreviousEncryptionKey !== undefined) {
    assertEncryptionKeyShape(nauttPreviousEncryptionKey, "NAUTT_ENCRYPTION_KEY_PREVIOUS");
    env.NAUTT_ENCRYPTION_KEY_PREVIOUS = nauttPreviousEncryptionKey;
  }
  const totpPreviousEncryptionKey = await readOptionalSecret("/run/secrets/totp_encryption_key_previous");
  if (totpPreviousEncryptionKey !== undefined) {
    assertEncryptionKeyShape(totpPreviousEncryptionKey, "TOTP_ENCRYPTION_KEY_PREVIOUS");
    env.TOTP_ENCRYPTION_KEY_PREVIOUS = totpPreviousEncryptionKey;
  }
  const child = spawn(process.execPath, ["server.js"], { env, stdio: "inherit", shell: false });
  child.once("error", (error) => safeFailure("application", error));
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
  child.once("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

main().catch((error) => safeFailure("runtime-preflight", error));

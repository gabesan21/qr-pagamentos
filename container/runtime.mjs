import { spawn } from "node:child_process";
import pg from "pg";
import { databaseUrl, readSecret, safeFailure } from "./lib.mjs";
import { MEDIA_STORAGE_ROOT, preflightMediaStorage } from "./media-preflight.mjs";

const { Client } = pg;

async function main() {
  if (process.env.MEDIA_STORAGE_ROOT !== MEDIA_STORAGE_ROOT) {
    throw Object.assign(new Error("invalid media root"), { code: "MEDIAROOT" });
  }
  await preflightMediaStorage();
  console.log("PASS runtime-media-preflight");
  const callbackUrl = new URL(process.env.NAUTT_WEBHOOK_CALLBACK_URL ?? "invalid:");
  if (callbackUrl.protocol !== "https:" || callbackUrl.username || callbackUrl.password || callbackUrl.hash) {
    throw new Error("invalid Nautt webhook callback configuration");
  }
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
  const child = spawn(process.execPath, ["server.js"], { env, stdio: "inherit", shell: false });
  child.once("error", (error) => safeFailure("application", error));
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => child.kill(signal));
  child.once("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
}

main().catch((error) => safeFailure("runtime-preflight", error));

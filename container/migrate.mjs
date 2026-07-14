import { spawn } from "node:child_process";
import { databaseUrl, readSecret, safeFailure } from "./lib.mjs";

async function main() {
  const password = await readSecret("/run/secrets/migrator_password");
  const env = { ...process.env, MIGRATION_DATABASE_URL: databaseUrl({ username: "qr_migrator", password, schema: true }) };
  delete env.DATABASE_URL;
  const child = spawn("pnpm", ["exec", "prisma", "migrate", "deploy"], { env, stdio: "inherit", shell: false });
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  if (status !== 0) throw Object.assign(new Error("migration failed"), { code: "MIGRATE" });
  console.log("PASS migration");
}

main().catch((error) => safeFailure("migration", error));

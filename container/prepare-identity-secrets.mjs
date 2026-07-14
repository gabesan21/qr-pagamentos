import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

import { normalizeEmail } from "../src/auth/identity.ts";

const targetDirectory = process.argv[2];
const recoveryOnly = process.argv.includes("--recovery");
if (!targetDirectory) throw new Error("target directory is required");

async function atomicWrite(name, value) {
  const temporary = path.join(targetDirectory, `.${name}.${process.pid}.tmp`);
  const target = path.join(targetDirectory, name);
  const handle = await open(temporary, "wx", 0o600);
  try { await handle.writeFile(value, "utf8"); } finally { await handle.close(); }
  await chmod(temporary, 0o600);
  await rename(temporary, target);
}

async function ensurePassword(name) {
  const target = path.join(targetDirectory, name);
  try {
    const existing = await readFile(target, "utf8");
    if (!/^[A-Za-z0-9_-]{32}$/.test(existing)) throw new Error("invalid protected password file");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await atomicWrite(name, randomBytes(24).toString("base64url"));
  }
  await chmod(target, 0o600);
}

await mkdir(targetDirectory, { recursive: true, mode: 0o700 });
await chmod(targetDirectory, 0o700);
if (recoveryOnly) {
  await ensurePassword("initial_admin_recovery_password");
  const initial = await readFile(path.join(targetDirectory, "initial_admin_password"), "utf8");
  const recovery = await readFile(path.join(targetDirectory, "initial_admin_recovery_password"), "utf8");
  if (initial === recovery) {
    await rm(path.join(targetDirectory, "initial_admin_recovery_password"));
    await ensurePassword("initial_admin_recovery_password");
  }
} else {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  if (/[\0\r\n]/.test(input)) throw new Error("invalid initial administrator email");
  await atomicWrite("initial_admin_email", `${normalizeEmail(input)}\n`);
  await ensurePassword("initial_admin_password");
}
await rm(path.join(targetDirectory, ".identity.tmp"), { force: true });

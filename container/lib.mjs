import { readFile } from "node:fs/promises";

export async function readSecret(path) {
  const value = (await readFile(path, "utf8")).replace(/[\r\n]+$/, "");
  if (!value) throw new Error("secret is empty");
  return value;
}

/**
 * Optional-secret convention shared by every rotation-window file: an absent
 * or empty file means "not configured" — never a silent partial read.
 */
export async function readOptionalSecret(path) {
  const raw = await readFile(path, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return "";
    throw error;
  });
  const value = raw.replace(/[\r\n]+$/, "");
  return value === "" ? undefined : value;
}

/** Same 32-byte base64url shape check applied to every encryption key. */
export function assertEncryptionKeyShape(value, name) {
  if (Buffer.from(value, "base64url").length !== 32) {
    throw new Error(`${name} must decode to 32 bytes`);
  }
}

export function databaseUrl({ username, password, schema = false }) {
  const url = new URL("postgresql://invalid/qr_pagamentos");
  url.hostname = process.env.POSTGRES_HOST ?? "db";
  url.port = process.env.POSTGRES_PORT ?? "5433";
  url.username = username;
  url.password = password;
  url.pathname = "/qr_pagamentos";
  if (schema) url.searchParams.set("schema", "app");
  return url.toString();
}

export function safeFailure(label, error) {
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code).replace(/[^A-Z0-9]/gi, "").slice(0, 12)
    : "FAILED";
  console.error(`ERROR ${label} code=${code || "FAILED"}`);
  process.exitCode = 1;
}

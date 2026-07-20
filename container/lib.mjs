import { readFile } from "node:fs/promises";

export async function readSecret(path) {
  const value = (await readFile(path, "utf8")).replace(/[\r\n]+$/, "");
  if (!value) throw new Error("secret is empty");
  return value;
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

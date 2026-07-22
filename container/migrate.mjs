import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import { databaseUrl, readSecret, safeFailure } from "./lib.mjs";

const { Client } = pg;

function digest(values) {
  return createHash("sha256").update(values.join("\n")).digest("hex");
}

async function repositoryMigrations() {
  const root = new URL("../prisma/migrations/", import.meta.url);
  const entries = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const migrations = new Map();
  for (const id of entries) {
    const sql = await readFile(new URL(`${id}/migration.sql`, root));
    migrations.set(id, createHash("sha256").update(sql).digest("hex"));
  }
  if (migrations.size === 0) throw Object.assign(new Error("migration repository is empty"), { code: "REPOSITORY" });
  return migrations;
}

async function migrationRows(client) {
  const existence = await client.query("SELECT to_regclass('app._prisma_migrations') AS relation");
  if (existence.rows[0]?.relation === null) return [];
  const result = await client.query(`
    SELECT migration_name, checksum, finished_at, rolled_back_at, logs
      FROM app._prisma_migrations
     ORDER BY migration_name, started_at
  `);
  return result.rows;
}

function verifyRows(repository, rows, { requireComplete }) {
  const grouped = new Map();
  for (const row of rows) {
    if (!repository.has(row.migration_name)) throw Object.assign(new Error("applied migration is absent from repository"), { code: "UNKNOWNID" });
    if (row.checksum !== repository.get(row.migration_name)) throw Object.assign(new Error("applied migration checksum mismatch"), { code: "CHECKSUM" });
    const existing = grouped.get(row.migration_name) ?? [];
    existing.push(row); grouped.set(row.migration_name, existing);
  }
  for (const [id, attempts] of grouped) {
    if (attempts.some((row) => row.rolled_back_at !== null || row.logs !== null || row.finished_at === null)) {
      throw Object.assign(new Error(`migration ${id} has failed or rolled-back history`), { code: "FAILEDROW" });
    }
    if (attempts.length !== 1) throw Object.assign(new Error(`migration ${id} has ambiguous history`), { code: "DUPLICATE" });
  }
  if (requireComplete) {
    for (const id of repository.keys()) if (!grouped.has(id)) throw Object.assign(new Error(`migration ${id} did not complete`), { code: "INCOMPLETE" });
  }
  return grouped;
}

async function deploy(env) {
  const child = spawn("pnpm", ["exec", "prisma", "migrate", "deploy"], { env, stdio: "inherit", shell: false });
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });
  if (status !== 0) throw Object.assign(new Error("migration failed"), { code: "MIGRATE" });
}

async function main() {
  const password = await readSecret("/run/secrets/migrator_password");
  const url = databaseUrl({ username: "qr_migrator", password, schema: true });
  const env = { ...process.env, MIGRATION_DATABASE_URL: url };
  delete env.DATABASE_URL;
  const repository = await repositoryMigrations();
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    const beforeRows = await migrationRows(client);
    const applied = verifyRows(repository, beforeRows, { requireComplete: false });
    const pending = [...repository.keys()].filter((id) => !applied.has(id));
    console.log(`PASS migration-preflight repository=${digest([...repository.keys()])} pending=${digest(pending)} count=${pending.length}`);
    await deploy(env);
    const afterRows = await migrationRows(client);
    verifyRows(repository, afterRows, { requireComplete: true });
    console.log(`PASS migration-complete repository=${digest([...repository.keys()])} pending=${digest(pending)} revision=${process.env.RELEASE_REVISION ?? "development"}`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => safeFailure("migration", error));

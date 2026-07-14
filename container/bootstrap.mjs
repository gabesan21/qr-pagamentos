import { readFile } from "node:fs/promises";
import pg from "pg";
import { databaseUrl, readSecret, safeFailure } from "./lib.mjs";

const { Client } = pg;

async function main() {
  const [admin, migrator, runtime] = await Promise.all([
    readSecret("/run/secrets/admin_password"),
    readSecret("/run/secrets/migrator_password"),
    readSecret("/run/secrets/runtime_password"),
  ]);
  if (new Set([admin, migrator, runtime]).size !== 3) throw new Error("secrets must be distinct");
  const client = new Client({ connectionString: databaseUrl({ username: "postgres", password: admin }) });
  await client.connect();
  try {
    await client.query(await readFile("prisma/bootstrap.sql", "utf8"));
    const migratorLiteral = await client.query("SELECT quote_literal($1) AS value", [migrator]);
    const runtimeLiteral = await client.query("SELECT quote_literal($1) AS value", [runtime]);
    await client.query(`ALTER ROLE qr_migrator PASSWORD ${migratorLiteral.rows[0].value}`);
    await client.query(`ALTER ROLE qr_runtime PASSWORD ${runtimeLiteral.rows[0].value}`);
  } finally {
    await client.end();
  }
  console.log("PASS bootstrap");
}

main().catch((error) => safeFailure("bootstrap", error));

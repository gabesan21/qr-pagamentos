import { readFile, readdir } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const exactDependencies = {
  "@prisma/adapter-pg": "7.8.0",
  "@prisma/client": "7.8.0",
  pg: "8.22.0",
};
const exactDevDependencies = { "@types/pg": "8.20.0", prisma: "7.8.0" };
for (const [name, version] of Object.entries(exactDependencies)) {
  assert(packageJson.dependencies?.[name] === version, `${name} must be pinned at ${version}`);
}
for (const [name, version] of Object.entries(exactDevDependencies)) {
  assert(packageJson.devDependencies?.[name] === version, `${name} must be pinned at ${version}`);
}
assert(packageJson.scripts?.["db:generate"] === "prisma generate", "db:generate contract changed");
assert(packageJson.scripts?.["db:test"] === "node pop/scripts/db-test.mjs", "db:test contract changed");

const envExample = await readFile(".env.example", "utf8");
assert(envExample === "MIGRATION_DATABASE_URL=<postgresql-migrator-url>\nDATABASE_URL=<postgresql-runtime-url>\n", ".env.example must contain only the two non-usable placeholders");
const prismaConfig = await readFile("prisma.config.ts", "utf8");
const runtimeClient = await readFile("src/db/client.ts", "utf8");
assert(prismaConfig.includes("process.env.MIGRATION_DATABASE_URL") && !prismaConfig.includes("process.env.DATABASE_URL"), "Prisma config must consume only the migration URL");
assert(runtimeClient.includes("process.env.DATABASE_URL") && !runtimeClient.includes("MIGRATION_DATABASE_URL"), "Runtime client must consume only the runtime URL");

const gitignore = await readFile(".gitignore", "utf8");
assert(gitignore.split("\n").includes("src/generated/prisma/"), "Generated Prisma output is not ignored");
const schema = await readFile("prisma/schema.prisma", "utf8");
for (const model of ["DatabaseFoundationFixture", "User", "PasswordCredential", "DeploymentBootstrap"]) {
  assert(schema.includes(`model ${model}`), `Schema is missing ${model}`);
}
assert(schema.includes('output   = "../src/generated/prisma"'), "Generated output changed");

const migrationDirectories = (await readdir("prisma/migrations", { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
assert(JSON.stringify(migrationDirectories) === JSON.stringify(["20260714000000_foundation_baseline", "20260714190000_local_identities"]), "Migration history name/count changed");
const migration = await readFile("prisma/migrations/20260714000000_foundation_baseline/migration.sql", "utf8");
for (const constraint of ["database_foundation_fixture_key_key", "database_foundation_fixture_key_nonblank", "database_foundation_fixture_quantity_nonnegative"]) {
  assert(migration.includes(constraint), `Migration lost ${constraint}`);
}
const identityMigration = await readFile("prisma/migrations/20260714190000_local_identities/migration.sql", "utf8");
for (const contract of ["user_username_key", "user_username_canonical", "user_email_key", "user_email_canonical", "user_role_closed", "user_status_closed", "password_credential_hash_format", "deployment_bootstrap_singleton", "reject_deployment_bootstrap_mutation", "initial_admin_user_id"]) {
  assert(identityMigration.includes(contract), `Identity migration lost ${contract}`);
}
assert(schema.includes("username   String") && schema.includes("email      String?"), "Prisma identity fields must be required username and nullable email");
assert(!/FOREIGN KEY \("initial_admin_user_id"\)/.test(identityMigration), "Deployment locator must not have a foreign key");

const bootstrap = await readFile("prisma/bootstrap.sql", "utf8");
assert(bootstrap.includes("GRANT CONNECT ON DATABASE qr_pagamentos TO qr_migrator, qr_runtime"), "Both roles require explicit CONNECT");
assert(bootstrap.includes("ALTER DEFAULT PRIVILEGES FOR ROLE qr_migrator IN SCHEMA app"), "Migrator-scoped defaults are missing");
assert(!/\bPASSWORD\s+['"]|postgres(?:ql)?:\/\//i.test(bootstrap), "Bootstrap must not contain credentials or URLs");

const readme = await readFile("README.md", "utf8");
for (const contract of ["pnpm db:generate", "pnpm db:test", "pnpm db:contract-check", "MIGRATION_DATABASE_URL", "DATABASE_URL", "startup gating", "application-only liveness"]) {
  assert(readme.includes(contract), `README is missing ${contract}`);
}
const rootDox = await readFile("AGENTS.md", "utf8");
const prismaDox = await readFile("prisma/AGENTS.md", "utf8");
assert(rootDox.includes("prisma/AGENTS.md") && rootDox.includes("src/generated/prisma/"), "Root DOX routing is incomplete");
assert(prismaDox.includes("Never use `db push`") && prismaDox.includes("immutable"), "Prisma DOX migration contract is incomplete");

console.log("PASS documentation-contract");

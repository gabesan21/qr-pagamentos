import { mkdtemp, cp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { canonicalManifest, generateSql, verifyRepository } from "./migration-policy.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectRejected(action, label) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`${label} was accepted`);
}

const fixtureRoot = resolve("pop/scripts/fixtures/migration-policy");
const validManifestBytes = await readFile(join(fixtureRoot, "all-operations.safe.json"), "utf8");
const validManifest = JSON.parse(validManifestBytes);
assert(validManifestBytes === canonicalManifest(validManifest), "all-operations fixture is not canonical JSON");
const validSql = generateSql(validManifest);
for (const required of ["CREATE TABLE", "ADD COLUMN", "CREATE INDEX", "PRIMARY KEY", "UNIQUE", "FOREIGN KEY", "CHECK", "VALIDATE CONSTRAINT", "GRANT", "REVOKE"]) {
  assert(validSql.includes(required), `all-operations fixture did not generate ${required}`);
}
for (const rejectedFixture of ["rejected-raw.safe.json", "rejected-unknown-field.safe.json"]) {
  const manifest = JSON.parse(await readFile(join(fixtureRoot, rejectedFixture), "utf8"));
  await expectRejected(() => Promise.resolve(generateSql(manifest)), rejectedFixture);
}

const forbiddenOperations = [
  "rawSql", "dropTable", "dropColumn", "dropConstraint", "delete", "truncate", "renameTable", "renameColumn",
  "alterColumn", "changeType", "update", "backfill", "begin", "commit", "rollback", "createFunction",
  "createTrigger", "createExtension", "createIndexConcurrently", "execute",
];
for (const op of forbiddenOperations) {
  await expectRejected(
    () => Promise.resolve(generateSql({ version: 1, id: "20260722000003_rejected", operations: [{ op }] })),
    `forbidden operation ${op}`,
  );
}
await expectRejected(
  () => Promise.resolve(generateSql({
    version: 1,
    id: "20260722000004_missing_default",
    operations: [{
      op: "addColumn",
      table: { schema: "app", name: "product" },
      column: { name: "unsafe", type: { name: "integer" }, nullable: false },
    }],
  })),
  "non-null added column without typed default",
);
for (const [label, operation] of [
  ["raw check expression", {
    op: "addConstraint", table: { schema: "app", name: "product" },
    constraint: { kind: "check", name: "unsafe_check", expression: { op: "raw", sql: "TRUE" }, notValid: true },
  }],
  ["expression default", {
    op: "addColumn", table: { schema: "app", name: "product" },
    column: { name: "unsafe", type: { name: "uuid" }, nullable: false, default: { kind: "expression", value: "gen_random_uuid()" } },
  }],
  ["custom type", {
    op: "addColumn", table: { schema: "app", name: "product" },
    column: { name: "unsafe", type: { name: "serial" }, nullable: true },
  }],
  ["destructive privilege", {
    op: "grant", object: { kind: "table", schema: "app", name: "product" }, privileges: ["TRUNCATE"], role: "qr_runtime",
  }],
  ["identifier injection", {
    op: "createIndex", name: "unsafe;drop", table: { schema: "app", name: "product" }, columns: ["id"], unique: false,
  }],
]) {
  await expectRejected(
    () => Promise.resolve(generateSql({ version: 1, id: "20260722000005_rejected_escape", operations: [operation] })),
    label,
  );
}
console.log("PASS migration-policy-language");

async function withRepositoryFixture(action) {
  const root = await mkdtemp(join(tmpdir(), "qr-migration-policy-"));
  try {
    await mkdir(join(root, "prisma/migrations"), { recursive: true });
    await cp("prisma/migration-policy-baseline.json", join(root, "prisma/migration-policy-baseline.json"));
    await cp("prisma/migrations/migration_lock.toml", join(root, "prisma/migrations/migration_lock.toml"));
    const pinned = JSON.parse(await readFile("prisma/migration-policy-baseline.json", "utf8"));
    for (const { id } of pinned.migrations) {
      await cp(join("prisma/migrations", id), join(root, "prisma/migrations", id), { recursive: true });
    }
    await action(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function addValidFuture(root) {
  const directory = join(root, "prisma/migrations", validManifest.id);
  await mkdir(directory);
  await writeFile(join(directory, "migration.safe.json"), canonicalManifest(validManifest));
  await writeFile(join(directory, "migration.sql"), validSql);
  return directory;
}

await withRepositoryFixture(async (root) => {
  const result = await verifyRepository(root);
  assert(result.baselineCount === 19 && result.futureCount === 0, "real repository baseline count differs");
  await addValidFuture(root);
  const futureResult = await verifyRepository(root);
  assert(futureResult.futureCount === 1, "valid future migration was not accepted");
});

await withRepositoryFixture(async (root) => {
  await writeFile(join(root, "prisma/migrations/20260714000000_foundation_baseline/migration.sql"), "-- changed\n");
  await expectRejected(() => verifyRepository(root), "changed baseline SQL");
});

await withRepositoryFixture(async (root) => {
  const baselinePath = join(root, "prisma/migration-policy-baseline.json");
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  baseline.migrations[0].sha256 = "0".repeat(64);
  await writeFile(baselinePath, canonicalManifest(baseline));
  await expectRejected(() => verifyRepository(root), "changed baseline hash entry");
});

await withRepositoryFixture(async (root) => {
  const baselinePath = join(root, "prisma/migration-policy-baseline.json");
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const first = baseline.migrations[0];
  const sqlPath = join(root, "prisma/migrations", first.id, "migration.sql");
  await writeFile(sqlPath, "-- co-mutated baseline SQL\n");
  first.sha256 = "b".repeat(64);
  await writeFile(baselinePath, canonicalManifest(baseline));
  await expectRejected(() => verifyRepository(root), "co-mutated baseline inventory and SQL");
});

await withRepositoryFixture(async (root) => {
  const baselinePath = join(root, "prisma/migration-policy-baseline.json");
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  baseline.migrations.pop();
  await writeFile(baselinePath, canonicalManifest(baseline));
  await expectRejected(() => verifyRepository(root), "missing baseline entry");
});

await withRepositoryFixture(async (root) => {
  await rm(join(root, "prisma/migrations/20260714190000_local_identities"), { recursive: true });
  await expectRejected(() => verifyRepository(root), "missing baseline directory");
});

await withRepositoryFixture(async (root) => {
  const baselinePath = join(root, "prisma/migration-policy-baseline.json");
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  [baseline.migrations[0], baseline.migrations[1]] = [baseline.migrations[1], baseline.migrations[0]];
  await writeFile(baselinePath, canonicalManifest(baseline));
  await expectRejected(() => verifyRepository(root), "reordered baseline entries");
});

await withRepositoryFixture(async (root) => {
  await mkdir(join(root, "prisma/migrations/20260715000000_inserted_history"));
  await writeFile(join(root, "prisma/migrations/20260715000000_inserted_history/migration.sql"), "-- inserted\n");
  await expectRejected(() => verifyRepository(root), "inserted baseline-era directory");
});

await withRepositoryFixture(async (root) => {
  const directory = await addValidFuture(root);
  await unlink(join(directory, "migration.safe.json"));
  await expectRejected(() => verifyRepository(root), "future migration without manifest");
});

await withRepositoryFixture(async (root) => {
  const directory = await addValidFuture(root);
  await writeFile(join(directory, "notes.txt"), "not allowed\n");
  await expectRejected(() => verifyRepository(root), "future migration with extra file");
});

await withRepositoryFixture(async (root) => {
  const directory = await addValidFuture(root);
  await writeFile(join(directory, "migration.sql"), `${validSql}-- tampered\n`);
  await expectRejected(() => verifyRepository(root), "tampered generated SQL");
});

await withRepositoryFixture(async (root) => {
  const directory = await addValidFuture(root);
  const nonCanonical = JSON.stringify(validManifest);
  await writeFile(join(directory, "migration.safe.json"), nonCanonical);
  await expectRejected(() => verifyRepository(root), "non-canonical manifest bytes");
});

console.log("PASS migration-policy-fixtures");

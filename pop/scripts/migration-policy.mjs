#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const MIGRATION_ID = /^\d{14}_[a-z][a-z0-9_]{0,62}$/;
const BASELINE_FILE = "prisma/migration-policy-baseline.json";
// This binds the editable inventory to the reviewed nineteen-migration anchor.
// Updating the inventory and its SQL together must still fail closed.
const BASELINE_INVENTORY_SHA256 = "711f7b047a890bd265c728ccec53ce7f89217f2b0e842b323a7a435b884ae2aa";
const MIGRATIONS_DIR = "prisma/migrations";
const MANIFEST_FILE = "migration.safe.json";
const SQL_FILE = "migration.sql";
const ALLOWED_MIGRATIONS_ROOT_FILES = new Set(["migration_lock.toml"]);
const TYPES = new Set(["bigint", "boolean", "date", "integer", "jsonb", "smallint", "text", "timestamptz", "uuid", "varchar"]);
const TABLE_PRIVILEGES = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);
const SEQUENCE_PRIVILEGES = new Set(["USAGE", "SELECT", "UPDATE"]);
const SCHEMA_PRIVILEGES = new Set(["USAGE"]);
const REFERENTIAL_ACTIONS = new Set(["CASCADE", "RESTRICT", "NO ACTION", "SET NULL"]);
const COMPARISONS = new Set(["eq", "ne", "lt", "lte", "gt", "gte"]);

export class MigrationPolicyError extends Error {}

function fail(message) {
  throw new MigrationPolicyError(message);
}

function object(value, path) {
  if (value === null || Array.isArray(value) || typeof value !== "object") fail(`${path} must be an object`);
  return value;
}

function exactKeys(value, allowed, path) {
  object(value, path);
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !(key in value));
  if (extras.length || missing.length) fail(`${path} fields differ (missing: ${missing.join(",") || "none"}; extra: ${extras.join(",") || "none"})`);
}

function identifier(value, path) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${path} must be a lowercase PostgreSQL identifier`);
  return value;
}

function identifierList(value, path) {
  if (!Array.isArray(value) || value.length === 0) fail(`${path} must be a non-empty array`);
  const result = value.map((item, index) => identifier(item, `${path}[${index}]`));
  if (new Set(result).size !== result.length) fail(`${path} contains duplicate identifiers`);
  return result;
}

function quote(value) {
  return `"${value}"`;
}

function qualified(table) {
  return `${quote(table.schema)}.${quote(table.name)}`;
}

function tableRef(value, path) {
  exactKeys(value, ["schema", "name"], path);
  return { schema: identifier(value.schema, `${path}.schema`), name: identifier(value.name, `${path}.name`) };
}

function typeSql(value, path) {
  object(value, path);
  if (!TYPES.has(value.name)) fail(`${path}.name is not an allowed type`);
  if (value.name === "varchar") {
    exactKeys(value, ["name", "length"], path);
    if (!Number.isInteger(value.length) || value.length < 1 || value.length > 10485760) fail(`${path}.length is invalid`);
    return `VARCHAR(${value.length})`;
  }
  exactKeys(value, ["name"], path);
  return value.name.toUpperCase();
}

function literalSql(value, path) {
  object(value, path);
  if (value.kind === "boolean") {
    exactKeys(value, ["kind", "value"], path);
    if (typeof value.value !== "boolean") fail(`${path}.value must be boolean`);
    return value.value ? "TRUE" : "FALSE";
  }
  if (value.kind === "integer") {
    exactKeys(value, ["kind", "value"], path);
    if (!Number.isSafeInteger(value.value)) fail(`${path}.value must be a safe integer`);
    return String(value.value);
  }
  if (["string", "uuid", "date", "timestamptz"].includes(value.kind)) {
    exactKeys(value, ["kind", "value"], path);
    if (typeof value.value !== "string" || value.value.includes("\0")) fail(`${path}.value must be a string without NUL`);
    if (value.kind === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.value)) fail(`${path}.value must be a canonical UUID`);
    if (value.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value.value)) fail(`${path}.value must be an ISO date`);
    if (value.kind === "timestamptz" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value.value)) fail(`${path}.value must be an ISO UTC timestamp`);
    const escaped = value.value.replaceAll("'", "''");
    const cast = value.kind === "uuid" ? "::UUID" : value.kind === "date" ? "::DATE" : value.kind === "timestamptz" ? "::TIMESTAMPTZ" : "";
    return `'${escaped}'${cast}`;
  }
  fail(`${path}.kind is not an allowed literal kind`);
}

function column(value, path, requireNonNullDefault = false) {
  exactKeys(value, "default" in value ? ["name", "type", "nullable", "default"] : ["name", "type", "nullable"], path);
  const name = identifier(value.name, `${path}.name`);
  if (typeof value.nullable !== "boolean") fail(`${path}.nullable must be boolean`);
  if (requireNonNullDefault && !value.nullable && !("default" in value)) fail(`${path} non-null added columns require a typed constant default`);
  const defaultSql = "default" in value ? ` DEFAULT ${literalSql(value.default, `${path}.default`)}` : "";
  return `${quote(name)} ${typeSql(value.type, `${path}.type`)}${defaultSql}${value.nullable ? "" : " NOT NULL"}`;
}

function operandSql(value, path) {
  object(value, path);
  if (value.kind === "column") {
    exactKeys(value, ["kind", "name"], path);
    return quote(identifier(value.name, `${path}.name`));
  }
  if (value.kind === "literal") {
    exactKeys(value, ["kind", "literal"], path);
    return literalSql(value.literal, `${path}.literal`);
  }
  fail(`${path}.kind is not an allowed operand`);
}

function checkSql(value, path) {
  object(value, path);
  if (COMPARISONS.has(value.op)) {
    exactKeys(value, ["op", "left", "right"], path);
    const symbols = { eq: "=", ne: "<>", lt: "<", lte: "<=", gt: ">", gte: ">=" };
    return `(${operandSql(value.left, `${path}.left`)} ${symbols[value.op]} ${operandSql(value.right, `${path}.right`)})`;
  }
  if (value.op === "and" || value.op === "or") {
    exactKeys(value, ["op", "items"], path);
    if (!Array.isArray(value.items) || value.items.length < 2) fail(`${path}.items must contain at least two expressions`);
    return `(${value.items.map((item, index) => checkSql(item, `${path}.items[${index}]`)).join(value.op === "and" ? " AND " : " OR ")})`;
  }
  if (value.op === "not") {
    exactKeys(value, ["op", "item"], path);
    return `(NOT ${checkSql(value.item, `${path}.item`)})`;
  }
  if (value.op === "isNull") {
    exactKeys(value, ["op", "column", "is"], path);
    if (typeof value.is !== "boolean") fail(`${path}.is must be boolean`);
    return `(${quote(identifier(value.column, `${path}.column`))} IS ${value.is ? "NULL" : "NOT NULL"})`;
  }
  if (value.op === "in") {
    exactKeys(value, ["op", "column", "values"], path);
    if (!Array.isArray(value.values) || value.values.length === 0) fail(`${path}.values must be non-empty`);
    return `(${quote(identifier(value.column, `${path}.column`))} IN (${value.values.map((item, index) => literalSql(item, `${path}.values[${index}]`)).join(", ")}))`;
  }
  fail(`${path}.op is not an allowed check operation`);
}

function constraintSql(value, path) {
  object(value, path);
  const name = identifier(value.name, `${path}.name`);
  if (value.kind === "primaryKey" || value.kind === "unique") {
    exactKeys(value, ["kind", "name", "columns"], path);
    const keyword = value.kind === "primaryKey" ? "PRIMARY KEY" : "UNIQUE";
    return `CONSTRAINT ${quote(name)} ${keyword} (${identifierList(value.columns, `${path}.columns`).map(quote).join(", ")})`;
  }
  if (value.kind === "foreignKey") {
    exactKeys(value, ["kind", "name", "columns", "references", "onDelete", "onUpdate", "notValid"], path);
    exactKeys(value.references, ["table", "columns"], `${path}.references`);
    const localColumns = identifierList(value.columns, `${path}.columns`);
    const referencedColumns = identifierList(value.references.columns, `${path}.references.columns`);
    if (localColumns.length !== referencedColumns.length) fail(`${path} foreign key column counts differ`);
    if (!REFERENTIAL_ACTIONS.has(value.onDelete) || !REFERENTIAL_ACTIONS.has(value.onUpdate)) fail(`${path} has an invalid referential action`);
    if (typeof value.notValid !== "boolean") fail(`${path}.notValid must be boolean`);
    return `CONSTRAINT ${quote(name)} FOREIGN KEY (${localColumns.map(quote).join(", ")}) REFERENCES ${qualified(tableRef(value.references.table, `${path}.references.table`))} (${referencedColumns.map(quote).join(", ")}) ON DELETE ${value.onDelete} ON UPDATE ${value.onUpdate}${value.notValid ? " NOT VALID" : ""}`;
  }
  if (value.kind === "check") {
    exactKeys(value, ["kind", "name", "expression", "notValid"], path);
    if (typeof value.notValid !== "boolean") fail(`${path}.notValid must be boolean`);
    return `CONSTRAINT ${quote(name)} CHECK ${checkSql(value.expression, `${path}.expression`)}${value.notValid ? " NOT VALID" : ""}`;
  }
  fail(`${path}.kind is not an allowed constraint kind`);
}

function privileges(value, kind, path) {
  if (!Array.isArray(value) || value.length === 0) fail(`${path} must be a non-empty array`);
  const allowed = kind === "table" ? TABLE_PRIVILEGES : kind === "sequence" ? SEQUENCE_PRIVILEGES : SCHEMA_PRIVILEGES;
  for (const privilege of value) if (!allowed.has(privilege)) fail(`${path} contains forbidden privilege ${privilege}`);
  if (new Set(value).size !== value.length) fail(`${path} contains duplicate privileges`);
  return value.join(", ");
}

function operationSql(value, path) {
  object(value, path);
  if (value.op === "createTable") {
    exactKeys(value, ["op", "table", "columns"], path);
    const table = tableRef(value.table, `${path}.table`);
    if (!Array.isArray(value.columns) || value.columns.length === 0) fail(`${path}.columns must be non-empty`);
    const names = value.columns.map((item, index) => identifier(item?.name, `${path}.columns[${index}].name`));
    if (new Set(names).size !== names.length) fail(`${path}.columns contains duplicate names`);
    return `CREATE TABLE ${qualified(table)} (\n  ${value.columns.map((item, index) => column(item, `${path}.columns[${index}]`)).join(",\n  ")}\n);`;
  }
  if (value.op === "addColumn") {
    exactKeys(value, ["op", "table", "column"], path);
    return `ALTER TABLE ${qualified(tableRef(value.table, `${path}.table`))} ADD COLUMN ${column(value.column, `${path}.column`, true)};`;
  }
  if (value.op === "createIndex") {
    exactKeys(value, ["op", "name", "table", "columns", "unique"], path);
    if (typeof value.unique !== "boolean") fail(`${path}.unique must be boolean`);
    return `CREATE ${value.unique ? "UNIQUE " : ""}INDEX ${quote(identifier(value.name, `${path}.name`))} ON ${qualified(tableRef(value.table, `${path}.table`))} (${identifierList(value.columns, `${path}.columns`).map(quote).join(", ")});`;
  }
  if (value.op === "addConstraint") {
    exactKeys(value, ["op", "table", "constraint"], path);
    return `ALTER TABLE ${qualified(tableRef(value.table, `${path}.table`))} ADD ${constraintSql(value.constraint, `${path}.constraint`)};`;
  }
  if (value.op === "validateConstraint") {
    exactKeys(value, ["op", "table", "name"], path);
    return `ALTER TABLE ${qualified(tableRef(value.table, `${path}.table`))} VALIDATE CONSTRAINT ${quote(identifier(value.name, `${path}.name`))};`;
  }
  if (value.op === "grant" || value.op === "revoke") {
    exactKeys(value, ["op", "object", "privileges", "role"], path);
    exactKeys(value.object, ["kind", "schema", ...(value.object.kind === "schema" ? [] : ["name"])], `${path}.object`);
    if (!["schema", "table", "sequence"].includes(value.object.kind)) fail(`${path}.object.kind is invalid`);
    const schema = identifier(value.object.schema, `${path}.object.schema`);
    const target = value.object.kind === "schema" ? quote(schema) : `${quote(schema)}.${quote(identifier(value.object.name, `${path}.object.name`))}`;
    const action = value.op === "grant" ? "GRANT" : "REVOKE";
    const connector = value.op === "grant" ? "TO" : "FROM";
    return `${action} ${privileges(value.privileges, value.object.kind, `${path}.privileges`)} ON ${value.object.kind.toUpperCase()} ${target} ${connector} ${quote(identifier(value.role, `${path}.role`))};`;
  }
  fail(`${path}.op is not allowed`);
}

export function canonicalManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function generateSql(manifest) {
  exactKeys(manifest, ["version", "id", "operations"], "manifest");
  if (manifest.version !== 1) fail("manifest.version must be 1");
  if (typeof manifest.id !== "string" || !MIGRATION_ID.test(manifest.id)) fail("manifest.id is invalid");
  if (!Array.isArray(manifest.operations) || manifest.operations.length === 0) fail("manifest.operations must be non-empty");
  return `-- Generated by pop/scripts/migration-policy.mjs. Do not edit.\n\n${manifest.operations.map((item, index) => operationSql(item, `manifest.operations[${index}]`)).join("\n\n")}\n`;
}

async function parseJson(path) {
  const bytes = await readFile(path, "utf8");
  let value;
  try { value = JSON.parse(bytes); } catch { fail(`${path} is not valid JSON`); }
  return { bytes, value };
}

async function parseCanonicalJson(path) {
  const { bytes, value } = await parseJson(path);
  if (bytes !== canonicalManifest(value)) fail(`${path} is not canonical JSON`);
  return value;
}

async function baseline(root) {
  const path = resolve(root, BASELINE_FILE);
  const bytes = await readFile(path);
  if (createHash("sha256").update(bytes).digest("hex") !== BASELINE_INVENTORY_SHA256) fail("baseline inventory differs from the immutable anchor");
  let value;
  try { value = JSON.parse(bytes); } catch { fail(`${path} is not valid JSON`); }
  exactKeys(value, ["version", "migrations"], "baseline");
  if (value.version !== 1 || !Array.isArray(value.migrations) || value.migrations.length !== 19) fail("baseline must contain exactly version 1 and nineteen migrations");
  let previous = "";
  for (const [index, migration] of value.migrations.entries()) {
    exactKeys(migration, ["id", "sha256"], `baseline.migrations[${index}]`);
    if (!MIGRATION_ID.test(migration.id) || migration.id <= previous) fail(`baseline migration ${migration.id} is invalid or unordered`);
    if (!/^[0-9a-f]{64}$/.test(migration.sha256)) fail(`baseline migration ${migration.id} has an invalid hash`);
    previous = migration.id;
  }
  return value.migrations;
}

export async function verifyRepository(root = process.cwd()) {
  const pinned = await baseline(root);
  const pinnedIds = new Set(pinned.map(({ id }) => id));
  const migrationsRoot = resolve(root, MIGRATIONS_DIR);
  const entries = await readdir(migrationsRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() && !ALLOWED_MIGRATIONS_ROOT_FILES.has(entry.name)) fail(`unexpected migrations root entry: ${entry.name}`);
  }
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const baselineIds = pinned.map(({ id }) => id);
  if (JSON.stringify(directories.slice(0, pinned.length)) !== JSON.stringify(baselineIds)) fail("baseline migration membership or order differs from the pinned baseline");
  const lastBaselineId = baselineIds.at(-1);
  for (const { id, sha256 } of pinned) {
    const files = await readdir(resolve(migrationsRoot, id), { withFileTypes: true });
    if (files.length !== 1 || !files[0].isFile() || files[0].name !== SQL_FILE) fail(`baseline migration ${id} must contain only migration.sql`);
    const actual = createHash("sha256").update(await readFile(resolve(migrationsRoot, id, SQL_FILE))).digest("hex");
    if (actual !== sha256) fail(`baseline migration ${id} hash differs`);
  }
  let previous = lastBaselineId;
  for (const id of directories.slice(pinned.length)) {
    if (pinnedIds.has(id) || !MIGRATION_ID.test(id) || id <= previous || id <= lastBaselineId) fail(`future migration ${id} is invalid or unordered`);
    const directory = resolve(migrationsRoot, id);
    const files = await readdir(directory, { withFileTypes: true });
    const names = files.map((entry) => entry.name).sort();
    if (files.some((entry) => !entry.isFile()) || JSON.stringify(names) !== JSON.stringify([MANIFEST_FILE, SQL_FILE])) fail(`future migration ${id} must contain only ${MANIFEST_FILE} and ${SQL_FILE}`);
    const manifest = await parseCanonicalJson(resolve(directory, MANIFEST_FILE));
    if (manifest.id !== id) fail(`future migration ${id} manifest id differs`);
    const expected = generateSql(manifest);
    const actual = await readFile(resolve(directory, SQL_FILE), "utf8");
    if (actual !== expected) fail(`future migration ${id} SQL differs from generated bytes`);
    previous = id;
  }
  return { baselineCount: pinned.length, futureCount: directories.length - pinned.length };
}

async function main(args) {
  const [command, ...rest] = args;
  if (command === "verify" && rest.length <= 1) {
    const root = rest[0] ? resolve(rest[0]) : process.cwd();
    const result = await verifyRepository(root);
    console.log(`PASS migration-policy baseline=${result.baselineCount} future=${result.futureCount}`);
    return;
  }
  if (command === "generate" && rest.length === 1) {
    const manifest = await parseCanonicalJson(resolve(rest[0]));
    process.stdout.write(generateSql(manifest));
    return;
  }
  fail("usage: migration-policy.mjs verify [repository-root] | generate <migration.safe.json>");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`FAIL migration-policy: ${error.message}`);
    process.exitCode = 1;
  });
}

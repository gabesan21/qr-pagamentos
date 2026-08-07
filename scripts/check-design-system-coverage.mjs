import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const coveragePath = "src/app/design-system/coverage.ts";
const inventoryPath = "src/components/ui/inventory.json";
const parityPath = "docs/frontend-template-parity/obligations.ndjson";

function assert(condition, message) {
  if (!condition) throw new Error(`DESIGN_SYSTEM_COVERAGE ${message}`);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function exists(candidate) {
  try { return (await stat(path.join(root, candidate))).isFile(); } catch { return false; }
}

/**
 * The F01 map is deliberately a literal tuple table. Parsing that narrow input
 * independently keeps evidence from trusting a hand-maintained duplicate list.
 */
export function coverageEntries(source) {
  const entry = /\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*\[([^\]]+)\],\s*\[([^\]]+)\]\]/g;
  return [...source.matchAll(entry)].map((match) => ({
    id: match[1],
    publicApi: match[2],
    fixture: match[3],
    states: [...match[4].matchAll(/"([^"]+)"/g)].map((item) => item[1]),
    notApplicable: [...match[5].matchAll(/"([^"]+)"/g)].map((item) => item[1]),
  }));
}

function primitiveNames(source) {
  const block = source.match(/export const primitiveCoverage = \[([\s\S]*?)\]\s+as const;/)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function expectedBindings(entries) {
  return entries.flatMap(({ fixture, id: owner, states }) => states.map((state) => ({ fixture, id: `ds-${owner}-${state}`, owner, selector: `#ds-${owner}-${state}`, state })));
}

function exactKeys(records, key) {
  return records.map(key).sort();
}

async function assertRenderedEvidence(entries, primitives) {
  const current = JSON.parse(await readFile(path.join(root, "artifacts/design-system/current.json"), "utf8"));
  const manifestBytes = await readFile(path.join(root, current.manifest));
  assert(sha256(manifestBytes) === current.manifestSha256, "current manifest hash mismatch");
  const manifest = JSON.parse(manifestBytes);
  const assertionBytes = await readFile(path.join(root, manifest.assertions.path));
  assert(sha256(assertionBytes) === manifest.assertions.sha256, "assertion file hash mismatch");
  const assertions = JSON.parse(assertionBytes);
  assert(assertions.length === 48, `expected 48 rendered assertion records, found ${assertions.length}`);
  const expected = expectedBindings(entries);
  const expectedBindingKeys = exactKeys(expected, ({ id, owner, state }) => `${id}:${owner}:${state}`);
  const expectedPrimitiveKeys = primitives.map((primitive) => `ds-primitive-${primitive.toLowerCase()}:${primitive}`).sort();
  for (const record of assertions) {
    const context = `${record.locale}/${record.theme}/${record.width}`;
    const bindings = record.coverage?.bindings ?? [];
    const primitiveBindings = record.coverage?.primitives ?? [];
    assert(bindings.length === expected.length, `rendered binding count drifted: ${context}`);
    assert(new Set(bindings.map(({ id }) => id)).size === expected.length, `rendered binding is missing or duplicated: ${context}`);
    assert(JSON.stringify(exactKeys(bindings, ({ id, owner, state }) => `${id}:${owner}:${state}`)) === JSON.stringify(expectedBindingKeys), `rendered binding owner/state mismatch: ${context}`);
    assert(bindings.every(({ childElements, fixture, occurrence, renderedSection, semanticWitness, visible }) => occurrence === 1 && childElements > 0 && fixture && renderedSection && (visible === true || (typeof semanticWitness === "string" && semanticWitness.length > 0))), `rendered binding lacks one visible or semantic DOM witness: ${context}`);
    assert(["actions", "copy", "overlays"].every((fixture) => bindings.some((binding) => binding.fixture === fixture)), `actions/copy/overlays fixture witness missing: ${context}`);
    assert(primitiveBindings.length === primitives.length, `rendered primitive count drifted: ${context}`);
    assert(new Set(primitiveBindings.map(({ id }) => id)).size === primitives.length, `rendered primitive is missing or duplicated: ${context}`);
    assert(JSON.stringify(exactKeys(primitiveBindings, ({ id, primitive }) => `${id}:${primitive}`)) === JSON.stringify(expectedPrimitiveKeys), `rendered primitive mismatch: ${context}`);
    assert(primitiveBindings.every(({ occurrence, visible }) => occurrence === 1 && visible === true), `rendered primitive lacks one visible DOM witness: ${context}`);
  }
  return { bindings: expected.length, primitives: primitives.length };
}

export async function checkDesignSystemCoverage(candidateRoot = root) {
  if (path.resolve(candidateRoot) !== root) throw new Error("DESIGN_SYSTEM_COVERAGE candidate roots are unsupported; run from the intended checkout.");
  const [coverageSource, inventory, parityText] = await Promise.all([
    readFile(path.join(root, coveragePath), "utf8"),
    readFile(path.join(root, inventoryPath), "utf8").then(JSON.parse),
    readFile(path.join(root, parityPath), "utf8"),
  ]);
  const entries = coverageEntries(coverageSource);
  const primitives = primitiveNames(coverageSource);
  assert(entries.length === 20, `expected 20 literal coverage entries, found ${entries.length}`);
  assert(new Set(entries.map(({ id }) => id)).size === entries.length, "coverage IDs are duplicated");
  assert(entries.every(({ fixture, states, notApplicable }) => fixture && states.length && notApplicable.length), "a fixture/state disposition is incomplete");
  assert(entries.every(({ states, notApplicable }) => !states.some((state) => notApplicable.includes(state))), "an applicable state is also marked N/A");
  assert(primitives.length === 23 && new Set(primitives).size === 23, `expected 23 unique primitive bindings, found ${primitives.length}`);

  const expectedOwners = inventory.owners.map(({ owner }) => owner).sort();
  const mappedOwners = entries.map(({ id }) => id === "data-directory-table" || id === "data-directory-filter" ? "src/data-directory/ui/data-directory.tsx" : `src/components/ui/${id}.tsx`).sort();
  assert(JSON.stringify(mappedOwners) === JSON.stringify(expectedOwners), "coverage owner inventory is missing, stale, or duplicated");
  for (const owner of mappedOwners) assert(await exists(owner), `production owner is missing: ${owner}`);

  const obligations = parityText.trim().split("\n").map(JSON.parse);
  assert(obligations.length === 2225, `canonical parity record count drifted: ${obligations.length}`);
  const shared = obligations.filter(({ laterOwner }) => laterOwner === inventory.task);
  assert(shared.length === 187, `shared parity obligation count drifted: ${shared.length}`);
  const current = obligations.filter(({ disposition, target }) => disposition === "current-only-presentation-map" && target?.route === "/design-system");
  assert(current.length === 1 && current[0].laterOwner === "12.2.4" && current[0].evidenceTarget === "all-states", "current /design-system parity record drifted");
  const rendered = await assertRenderedEvidence(entries, primitives);
  return { entries: entries.length, states: entries.reduce((total, item) => total + item.states.length, 0), notApplicable: entries.reduce((total, item) => total + item.notApplicable.length, 0), obligations: obligations.length, sharedObligations: shared.length, ...rendered };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkDesignSystemCoverage();
  console.log(`DESIGN_SYSTEM_COVERAGE_OK entries=${result.entries} states=${result.states} notApplicable=${result.notApplicable} primitives=${result.primitives} renderedBindings=${result.bindings} obligations=${result.obligations} shared=${result.sharedObligations}`);
}

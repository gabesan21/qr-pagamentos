import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const coveragePath = "src/app/design-system/coverage.ts";
const inventoryPath = "src/components/ui/inventory.json";
const parityPath = "docs/frontend-template-parity/obligations.ndjson";

function assert(condition, message) {
  if (!condition) throw new Error(`DESIGN_SYSTEM_COVERAGE ${message}`);
}

async function exists(candidate) {
  try { return (await stat(path.join(root, candidate))).isFile(); } catch { return false; }
}

/**
 * The F01 map is deliberately a literal tuple table. Parsing that narrow input
 * independently keeps evidence from trusting a hand-maintained duplicate list.
 */
function coverageEntries(source) {
  const entry = /\["([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*\[([^\]]+)\],\s*\[([^\]]+)\]\]/g;
  return [...source.matchAll(entry)].map((match) => ({
    id: match[1],
    publicApi: match[2],
    fixture: match[3],
    states: [...match[4].matchAll(/"([^"]+)"/g)].map((item) => item[1]),
    notApplicable: [...match[5].matchAll(/"([^"]+)"/g)].map((item) => item[1]),
  }));
}

export async function checkDesignSystemCoverage(candidateRoot = root) {
  if (path.resolve(candidateRoot) !== root) throw new Error("DESIGN_SYSTEM_COVERAGE candidate roots are unsupported; run from the intended checkout.");
  const [coverageSource, inventory, parityText] = await Promise.all([
    readFile(path.join(root, coveragePath), "utf8"),
    readFile(path.join(root, inventoryPath), "utf8").then(JSON.parse),
    readFile(path.join(root, parityPath), "utf8"),
  ]);
  const entries = coverageEntries(coverageSource);
  assert(entries.length === 20, `expected 20 literal coverage entries, found ${entries.length}`);
  assert(new Set(entries.map(({ id }) => id)).size === entries.length, "coverage IDs are duplicated");
  assert(entries.every(({ fixture, states, notApplicable }) => fixture && states.length && notApplicable.length), "a fixture/state disposition is incomplete");
  assert(entries.every(({ states, notApplicable }) => !states.some((state) => notApplicable.includes(state))), "an applicable state is also marked N/A");

  const expectedOwners = inventory.owners.map(({ owner }) => owner).sort();
  const mappedOwners = entries.map(({ id }) => id === "data-directory-table" || id === "data-directory-filter" ? "src/data-directory/ui/data-directory.tsx" : `src/components/ui/${id}.tsx`).sort();
  assert(JSON.stringify(mappedOwners) === JSON.stringify(expectedOwners), "coverage owner inventory is missing, stale, or duplicated");
  for (const owner of mappedOwners) assert(await exists(owner), `production owner is missing: ${owner}`);

  const obligations = parityText.trim().split("\n").map(JSON.parse);
  assert(obligations.length === 2230, `canonical parity record count drifted: ${obligations.length}`);
  const shared = obligations.filter(({ laterOwner }) => laterOwner === inventory.task);
  assert(shared.length === 187, `shared parity obligation count drifted: ${shared.length}`);
  const current = obligations.filter(({ disposition, target }) => disposition === "current-only-presentation-map" && target?.route === "/design-system");
  assert(current.length === 1 && current[0].laterOwner === "12.2.4" && current[0].evidenceTarget === "all-states", "current /design-system parity record drifted");
  return { entries: entries.length, states: entries.reduce((total, item) => total + item.states.length, 0), notApplicable: entries.reduce((total, item) => total + item.notApplicable.length, 0), obligations: obligations.length, sharedObligations: shared.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkDesignSystemCoverage();
  console.log(`DESIGN_SYSTEM_COVERAGE_OK entries=${result.entries} states=${result.states} notApplicable=${result.notApplicable} obligations=${result.obligations} shared=${result.sharedObligations}`);
}

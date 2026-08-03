import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const authorityPath = "docs/frontend-template-parity/obligations.ndjson";
const inventoryPath = "src/components/ui/inventory.json";

function assert(condition, message) {
  if (!condition) throw new Error(`SHARED_UI_INVENTORY ${message}`);
}

async function exists(root, candidate) {
  try { return (await stat(path.join(root, candidate))).isFile(); } catch { return false; }
}

export async function checkSharedUiInventory(candidateRoot = process.cwd()) {
  const root = path.resolve(candidateRoot);
  const inventory = JSON.parse(await readFile(path.join(root, inventoryPath), "utf8"));
  const obligations = (await readFile(path.join(root, authorityPath), "utf8")).trim().split("\n").map(JSON.parse);
  const owned = obligations.filter(({ laterOwner }) => laterOwner === inventory.task);
  const exclusions = obligations.filter(({ disposition }) => disposition === "excluded-unreachable-generated-ui");
  const owners = new Map();

  assert(inventory.schemaVersion === 1, "schema must be v1");
  assert(inventory.obligationAuthority === authorityPath, "authority path drifted");
  assert(inventory.owners.length === 20, `expected 20 reachable owners, found ${inventory.owners.length}`);
  for (const entry of inventory.owners) {
    assert(!owners.has(entry.templateSource), `duplicate template owner ${entry.templateSource}`);
    assert(await exists(root, entry.owner), `missing production owner ${entry.owner}`);
    assert(entry.responsibility && entry.publicApi.length > 0, `incomplete public contract ${entry.owner}`);
    assert(entry.states.length > 0 && entry.notApplicable.length > 0, `incomplete state disposition ${entry.owner}`);
    owners.set(entry.templateSource, entry);
  }

  assert(owned.length === inventory.expectedObligations, `expected ${inventory.expectedObligations} obligations, found ${owned.length}`);
  const mappedIds = new Set();
  for (const obligation of owned) {
    assert(!mappedIds.has(obligation.id), `duplicate obligation ${obligation.id}`);
    assert(owners.has(obligation.source.path), `unmapped obligation ${obligation.id} from ${obligation.source.path}`);
    mappedIds.add(obligation.id);
  }
  assert(mappedIds.size === owned.length, "obligation mapping is not one-to-one");
  assert([...owners.keys()].every((source) => owned.some((obligation) => obligation.source.path === source)), "inventory contains an owner without an obligation");

  assert(exclusions.length === inventory.expectedExcludedGeneratedSources, `expected ${inventory.expectedExcludedGeneratedSources} exclusions, found ${exclusions.length}`);
  assert(exclusions.some(({ source }) => source.path.endsWith("/ImageUploader.tsx")), "ImageUploader exclusion disappeared");
  assert(!inventory.owners.some(({ templateSource }) => exclusions.some(({ source }) => source.path === templateSource)), "excluded source entered reachable ownership");

  assert(inventory.officialAdditions.length === 9, `expected 9 focused official additions, found ${inventory.officialAdditions.length}`);
  for (const addition of inventory.officialAdditions) {
    assert(await exists(root, addition.source), `missing official addition ${addition.source}`);
    assert(addition.insufficiency?.length > 20, `missing insufficiency finding ${addition.source}`);
  }

  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  for (const [dependency, version] of Object.entries(inventory.requiredDependencies)) {
    assert(packageJson.dependencies?.[dependency] === version, `dependency ${dependency} must equal ${version}`);
  }

  return { obligations: mappedIds.size, owners: owners.size, exclusions: exclusions.length, additions: inventory.officialAdditions.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await checkSharedUiInventory(process.env.SHARED_UI_INVENTORY_ROOT ?? process.cwd());
  console.log(`SHARED_UI_INVENTORY_OK obligations=${result.obligations} owners=${result.owners} exclusions=${result.exclusions} additions=${result.additions}`);
}

import { access, readFile } from "node:fs/promises";
import path from "node:path";

const taskMarker = "[[1.4.4-refactor-admin-surfaces-onto-design-system]]";
const adapters = ["action-button.tsx", "field.tsx", "panel.tsx", "status.tsx", "primitives.test.tsx"];

async function exists(candidate) {
  try { await access(candidate); return true; } catch { return false; }
}

function section(source, heading) {
  const marker = `## ${heading}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing ${heading} section`);
  const contentStart = start + marker.length;
  const next = source.indexOf("\n## ", contentStart);
  return source.slice(contentStart, next < 0 ? source.length : next);
}

export async function checkAdminContractSync(candidateRoot) {
  const root = path.resolve(candidateRoot);
  const [rootDox, componentDox, design, foundation, designSystem] = await Promise.all([
    readFile(path.join(root, "AGENTS.md"), "utf8"),
    readFile(path.join(root, "src/components/ui/AGENTS.md"), "utf8"),
    readFile(path.join(root, "DESIGN.md"), "utf8"),
    readFile(path.join(root, "pop/specs/administrative-foundation.md"), "utf8"),
    readFile(path.join(root, "pop/specs/administrative-design-system.md"), "utf8"),
  ]);

  for (const adapter of adapters) {
    if (await exists(path.join(root, "src/app/ui", adapter))) throw new Error(`stale adapter file ${adapter}`);
  }
  if (await exists(path.join(root, "src/app/ui/AGENTS.md"))) throw new Error("stale adapter contract");
  if (rootDox.includes("src/app/ui/AGENTS.md")) throw new Error("stale root DOX adapter index");
  if (componentDox.includes("app/ui/AGENTS.md")) throw new Error("stale component DOX lateral link");
  if (/ActionButton|compatibility adapter|temporary adapter|app `Field`|`Panel`|`Status`/.test(design)) throw new Error("stale adapter inventory in DESIGN.md");

  const specSections = [section(foundation, "Implemented slices"), section(designSystem, "Implemented slice")];
  for (const [index, implemented] of specSections.entries()) {
    if (!implemented.includes(taskMarker)) throw new Error(`task marker missing from implemented spec ${index + 1}`);
  }
  for (const [name, source] of [["administrative-foundation", foundation], ["administrative-design-system", designSystem]]) {
    const beforeImplemented = source.slice(0, source.indexOf("## Implemented"));
    if (beforeImplemented.includes(taskMarker)) throw new Error(`planned slice remains in ${name}`);
  }
  return "ADMIN_CONTRACT_SYNC_OK task=1.4.4 adapters=0 index=absent implemented_slices=2 planned_slices=0 design=current";
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(await checkAdminContractSync(process.env.ADMIN_CONTRACT_CHECK_ROOT ?? process.cwd()));

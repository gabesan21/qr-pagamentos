import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { checkAdminContractSync } from "./check-admin-contract-sync.mjs";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "admin-contract-check-"));
  for (const file of ["AGENTS.md", "DESIGN.md", "src/components/ui/AGENTS.md", "pop/specs/administrative-foundation.md", "pop/specs/administrative-design-system.md"]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.resolve(file), path.join(root, file));
  }
  return root;
}

function overwrite(root: string, file: string, source: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), source);
}

describe("admin contract synchronization", () => {
  it("returns the exact synchronized summary", async () => {
    await expect(checkAdminContractSync(fixture())).resolves.toBe("ADMIN_CONTRACT_SYNC_OK task=1.4.4 adapters=0 index=absent implemented_slices=2 planned_slices=0 design=current");
  });

  it.each([
    ["adapter file", "src/app/ui/panel.tsx", "export const Panel = 1"],
    ["adapter contract", "src/app/ui/AGENTS.md", "# stale"],
    ["root index", "AGENTS.md", "src/app/ui/AGENTS.md"],
    ["component lateral", "src/components/ui/AGENTS.md", "../../app/ui/AGENTS.md"],
    ["design inventory", "DESIGN.md", "ActionButton compatibility adapter"],
  ])("fails closed for stale %s", async (_name, file, source) => {
    const root = fixture();
    overwrite(root, file, source);
    await expect(checkAdminContractSync(root)).rejects.toThrow(/stale/);
  });

  it("rejects a task link outside the implemented spec section", async () => {
    const root = fixture();
    overwrite(root, "pop/specs/administrative-design-system.md", `# Spec\n\n${"[[1.4.4-refactor-admin-surfaces-onto-design-system]]"}\n\n## Implemented slice\n\n- another task\n`);
    await expect(checkAdminContractSync(root)).rejects.toThrow(/missing from implemented spec|planned slice remains/);
  });

  it("rejects a remaining planned slice even when implemented exists", async () => {
    const root = fixture();
    const file = "pop/specs/administrative-foundation.md";
    overwrite(root, file, `# Spec\n\n## Open\n\n- [[1.4.4-refactor-admin-surfaces-onto-design-system]] planned\n\n## Implemented slices\n\n- [[1.4.4-refactor-admin-surfaces-onto-design-system]] done\n`);
    await expect(checkAdminContractSync(root)).rejects.toThrow("planned slice remains");
  });
});

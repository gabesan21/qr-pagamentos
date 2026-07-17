import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { checkAdminUiInventory } from "./check-admin-ui-inventory.mjs";

function fixture(source: string) {
  const root = mkdtempSync(path.join(tmpdir(), "admin-source-check-"));
  for (const directory of ["src/app/admin", "src/app/language-preference"]) mkdirSync(path.join(root, directory), { recursive: true });
  writeFileSync(path.join(root, "src/app/page.tsx"), source);
  writeFileSync(path.join(root, "src/app/admin/page.tsx"), "export default function Page(){return <main className=\"admin-shell\" />}");
  writeFileSync(path.join(root, "src/app/language-preference/form.tsx"), "export function Form(){return <form />}");
  return root;
}

describe("admin UI source inventory", () => {
  it("returns every clean consumer and exact zero counters", async () => {
    const result = await checkAdminUiInventory(fixture("export default function Home(){return <main className=\"admin-shell\" />}"));
    expect(result.files).toContain("src/app/admin/page.tsx");
    expect(result.files).toContain("src/app/language-preference/form.tsx");
    expect(result.counters).toEqual({ raw_controls: 0, adapter_imports: 0, inline_styles: 0, local_variants: 0 });
  });

  it.each([
    ["raw_controls", "export default function Home(){return <button />}"],
    ["adapter_imports", "import { Panel } from '@/app/ui/panel'; export default function Home(){return <Panel />}"],
    ["inline_styles", "export default function Home(){return <main style={{display:'grid'}} />}"],
    ["local_variants", "export default function Home(){return <main className=\"bg-blue-500\" />}"],
  ])("rejects %s independently", async (category, source) => {
    await expect(checkAdminUiInventory(fixture(source))).rejects.toThrow(category);
  });
});

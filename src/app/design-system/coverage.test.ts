import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { designSystemEn } from "@/i18n/dictionaries/design-system/en";
import { designSystemPtBR } from "@/i18n/dictionaries/design-system/pt-BR";

import { designSystemCoverage, primitiveCoverage } from "./coverage";

const sharedInventory = JSON.parse(
  readFileSync(new URL("../../components/ui/inventory.json", import.meta.url), "utf8"),
) as { owners: Array<{ owner: string }> };

describe("design-system closed coverage map", () => {
  it("maps each of the 20 inventory responsibilities to one stable specimen fixture", () => {
    expect(designSystemCoverage).toHaveLength(20);
    expect(new Set(designSystemCoverage.map(({ id }) => id)).size).toBe(20);
    expect(designSystemCoverage.every(({ fixture, notApplicable, owner, states }) => fixture.length > 0 && owner.startsWith("src/") && states.length > 0 && notApplicable.length > 0)).toBe(true);
  });

  it("keeps every inventory owner represented and every shared primitive named", () => {
    const mappedOwners = new Set(designSystemCoverage.map(({ owner }) => owner));
    for (const owner of sharedInventory.owners.map(({ owner }) => owner)) {
      expect(mappedOwners.has(owner)).toBe(true);
    }
    expect(primitiveCoverage).toHaveLength(23);
  });

  it("keeps the route server-first and free of domain/auth or mutation imports", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('"use client"');
    expect(source).not.toMatch(/@\/auth|@\/checkout|@\/integrations|@\/nautt|method=|<form/u);
    expect(source).toContain("localeFromPreferenceCookie");
  });

  it("keeps the narrow tab fixture on compact dedicated labels", () => {
    const source = readFileSync(new URL("./interactive-specimens.tsx", import.meta.url), "utf8");
    expect(source).toContain("dictionary.designSystemTabsReadyLabel");
    expect(source).toContain("dictionary.designSystemTabsReviewLabel");
    expect(source).toContain("dictionary.designSystemTabsArchivedLabel");
    expect([
      designSystemEn.designSystemTabsReadyLabel,
      designSystemEn.designSystemTabsReviewLabel,
      designSystemEn.designSystemTabsArchivedLabel,
    ]).toEqual(["Ready", "Review", "Archived"]);
    expect([
      designSystemPtBR.designSystemTabsReadyLabel,
      designSystemPtBR.designSystemTabsReviewLabel,
      designSystemPtBR.designSystemTabsArchivedLabel,
    ]).toEqual(["Pronto", "Revisão", "Arquivado"]);
  });

  it("allows the identity fixture to wrap inside the narrow specimen track", () => {
    const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source).toContain('className="flex flex-wrap items-center gap-4"');
    expect(source).toContain("dictionary.designSystemDanger");
  });
});

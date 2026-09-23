import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { checkSharedUiInventory } from "./check-shared-ui-inventory.mjs";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "shared-ui-inventory-"));
  for (const candidate of ["docs/frontend-template-parity/obligations.ndjson", "src/components/ui", "src/data-directory/ui/data-directory.tsx", "package.json"]) {
    cpSync(candidate, path.join(root, candidate), { recursive: true });
  }
  return root;
}

describe("shared UI anti-drift inventory", () => {
  it("closes every assigned obligation once and preserves exclusions", async () => {
    await expect(checkSharedUiInventory(process.cwd())).resolves.toEqual({ obligations: 187, owners: 20, exclusions: 49, additions: 9, currentPrimitives: 8 });
  });

  it("rejects a missing production owner", async () => {
    const root = fixture();
    const inventoryPath = path.join(root, "src/components/ui/inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    inventory.owners[0].owner = "src/components/ui/missing.tsx";
    writeFileSync(inventoryPath, JSON.stringify(inventory));
    await expect(checkSharedUiInventory(root)).rejects.toThrow("missing production owner");
  });

  it("rejects an unmapped obligation", async () => {
    const root = fixture();
    const authority = path.join(root, "docs/frontend-template-parity/obligations.ndjson");
    const lines = readFileSync(authority, "utf8").trim().split("\n");
    const target = lines.findIndex((line) => JSON.parse(line).laterOwner === "12.2.3");
    const obligation = JSON.parse(lines[target]);
    obligation.source.path = "docs/template/app/src/components/ui/Drift.tsx";
    lines[target] = JSON.stringify(obligation);
    writeFileSync(authority, `${lines.join("\n")}\n`);
    await expect(checkSharedUiInventory(root)).rejects.toThrow("unmapped obligation");
  });

  it("rejects dependency drift", async () => {
    const root = fixture();
    const packagePath = path.join(root, "package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
    packageJson.dependencies.sonner = "latest";
    writeFileSync(packagePath, JSON.stringify(packageJson));
    await expect(checkSharedUiInventory(root)).rejects.toThrow("dependency sonner must equal 2.0.7");
  });

  it("rejects a missing changed primitive evidence binding", async () => {
    const root = fixture();
    const inventoryPath = path.join(root, "src/components/ui/inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    inventory.currentPrimitiveSources.pop();
    writeFileSync(inventoryPath, JSON.stringify(inventory));
    await expect(checkSharedUiInventory(root)).rejects.toThrow("current primitive evidence inventory drifted");
  });

  it("rejects a localAddition with an incomplete public contract", async () => {
    const root = fixture();
    const inventoryPath = path.join(root, "src/components/ui/inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    delete inventory.localAdditions[0].publicApi;
    writeFileSync(inventoryPath, JSON.stringify(inventory));
    await expect(checkSharedUiInventory(root)).rejects.toThrow("incomplete local addition public contract");
  });

  it("rejects a localAddition without a recorded insufficiency finding", async () => {
    const root = fixture();
    const inventoryPath = path.join(root, "src/components/ui/inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    inventory.localAdditions[0].insufficiency = "too short";
    writeFileSync(inventoryPath, JSON.stringify(inventory));
    await expect(checkSharedUiInventory(root)).rejects.toThrow("missing local addition insufficiency finding");
  });

  it("rejects a localAddition that collides with a reachable owner", async () => {
    const root = fixture();
    const inventoryPath = path.join(root, "src/components/ui/inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    inventory.localAdditions[0].owner = inventory.owners[0].owner;
    writeFileSync(inventoryPath, JSON.stringify(inventory));
    await expect(checkSharedUiInventory(root)).rejects.toThrow("local addition collides with a reachable owner");
  });

  it("rejects a localAddition whose templateSource is not a recorded exclusion", async () => {
    const root = fixture();
    const inventoryPath = path.join(root, "src/components/ui/inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    inventory.localAdditions[0].templateSource = "docs/template/app/src/components/ui/NotExcluded.tsx";
    writeFileSync(inventoryPath, JSON.stringify(inventory));
    await expect(checkSharedUiInventory(root)).rejects.toThrow("local addition templateSource is not a recorded exclusion");
  });

  it("rejects a duplicate localAddition owner", async () => {
    const root = fixture();
    const inventoryPath = path.join(root, "src/components/ui/inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    inventory.localAdditions.push(inventory.localAdditions[0]);
    writeFileSync(inventoryPath, JSON.stringify(inventory));
    await expect(checkSharedUiInventory(root)).rejects.toThrow("duplicate local addition");
  });

  it("rejects an empty localAdditions section", async () => {
    const root = fixture();
    const inventoryPath = path.join(root, "src/components/ui/inventory.json");
    const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
    inventory.localAdditions = [];
    writeFileSync(inventoryPath, JSON.stringify(inventory));
    await expect(checkSharedUiInventory(root)).rejects.toThrow("localAdditions section missing or empty");
  });
});

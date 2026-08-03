import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const changedPrimitiveSources = [
  "src/components/ui/badge.tsx",
  "src/components/ui/card.tsx",
  "src/components/ui/field.tsx",
  "src/components/ui/input.tsx",
  "src/components/ui/native-select.tsx",
  "src/components/ui/spinner.tsx",
  "src/components/ui/table.tsx",
  "src/components/ui/textarea.tsx",
];

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "design-system-evidence-"));
  const current = JSON.parse(readFileSync("artifacts/design-system/current.json", "utf8"));
  const manifest = JSON.parse(readFileSync(current.manifest, "utf8"));
  const inventory = JSON.parse(readFileSync("src/components/ui/inventory.json", "utf8"));
  const additionalSources = [
    ...inventory.currentPrimitiveSources,
    "scripts/verify-design-system-evidence.test.ts",
  ];
  for (const source of additionalSources) {
    if (!manifest.sources.some((entry: { path: string }) => entry.path === source)) {
      manifest.sources.push({ path: source, sha256: "" });
    }
  }
  cpSync("artifacts/design-system", path.join(root, "artifacts/design-system"), { recursive: true });
  cpSync("scripts/verify-design-system-evidence.mjs", path.join(root, "scripts/verify-design-system-evidence.mjs"));
  for (const source of manifest.sources) {
    cpSync(source.path, path.join(root, source.path));
    source.sha256 = createHash("sha256").update(readFileSync(source.path)).digest("hex");
  }
  manifest.sources.sort((left: { path: string }, right: { path: string }) => left.path.localeCompare(right.path));
  const manifestPath = path.join(root, current.manifest);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestSha256 = createHash("sha256").update(readFileSync(manifestPath)).digest("hex");
  const reviewPath = path.join(root, `artifacts/design-system/${current.runId}/review.md`);
  writeFileSync(reviewPath, readFileSync(reviewPath, "utf8").replace(current.manifestSha256, manifestSha256));
  writeFileSync(path.join(root, "artifacts/design-system/current.json"), `${JSON.stringify({ ...current, manifestSha256 }, null, 2)}\n`);
  return root;
}

describe("design-system evidence source boundary", () => {
  it("rejects drift in every changed current primitive", () => {
    const baseline = fixture();
    expect(() => execFileSync(process.execPath, ["scripts/verify-design-system-evidence.mjs"], {
      cwd: baseline,
      encoding: "utf8",
      stdio: "pipe",
    })).not.toThrow();

    for (const source of changedPrimitiveSources) {
      const root = fixture();
      const target = path.join(root, source);
      writeFileSync(target, `${readFileSync(target, "utf8")}\n// mutation\n`);
      expect(() => execFileSync(process.execPath, ["scripts/verify-design-system-evidence.mjs"], {
        cwd: root,
        encoding: "utf8",
        stdio: "pipe",
      })).toThrow(/Evidence source hash mismatch/);
    }
  }, 60_000);
});

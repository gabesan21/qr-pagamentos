import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

function writeJson(target: string, value: unknown) {
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "design-system-evidence-"));
  const current = JSON.parse(readFileSync("artifacts/design-system/current.json", "utf8"));
  const manifest = JSON.parse(readFileSync(current.manifest, "utf8"));
  const runRoot = path.join(root, `artifacts/design-system/${current.runId}`);
  mkdirSync(runRoot, { recursive: true });
  cpSync(`artifacts/design-system/${current.runId}`, runRoot, { recursive: true });
  for (const source of manifest.sources) {
    const target = path.join(root, source.path);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source.path, target);
  }
  for (const script of ["scripts/check-design-system-coverage.mjs", "scripts/verify-design-system-evidence.mjs"]) {
    const target = path.join(root, script);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(script, target);
  }
  for (const authority of ["src/components/ui/inventory.json", "src/app/design-system/coverage.ts", "docs/frontend-template-parity/obligations.ndjson"]) {
    const target = path.join(root, authority);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(authority, target);
  }
  for (const source of manifest.sources) {
    source.sha256 = hash(readFileSync(path.join(root, source.path)));
  }
  mkdirSync(path.join(root, "artifacts/design-system"), { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "evidence@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Evidence Fixture"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  manifest.gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

  const persistManifest = () => {
    const manifestPath = path.join(root, current.manifest);
    writeJson(manifestPath, manifest);
    const manifestSha256 = hash(readFileSync(manifestPath));
    const reviewPath = path.join(runRoot, "review.md");
    const review = readFileSync(reviewPath, "utf8").replace(/Manifest SHA-256: [a-f0-9]{64}/, `Manifest SHA-256: ${manifestSha256}`);
    writeFileSync(reviewPath, review);
    writeJson(path.join(root, "artifacts/design-system/current.json"), { ...current, manifestSha256 });
  };
  persistManifest();
  return { root, current, manifest, persistManifest };
}

function verify(root: string) {
  return () => execFileSync(process.execPath, ["scripts/verify-design-system-evidence.mjs"], { cwd: root, encoding: "utf8", stdio: "pipe" });
}

function commit(root: string, message: string) {
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", message], { cwd: root });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

describe("design-system evidence fail-closed boundaries", () => {
  const cleanupDirs: string[] = [];

  afterEach(() => {
    for (const dir of cleanupDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    cleanupDirs.length = 0;
  });

  afterAll(() => {
    const remaining = readdirSync(tmpdir()).filter((name) => name.startsWith("design-system-evidence-"));
    expect(remaining).toEqual([]);
  });

  it("accepts an evidence-only descendant commit while source hashes remain exact", () => {
    const state = fixture();
    cleanupDirs.push(state.root);
    const capturedHead = state.manifest.gitHead;
    const descendantHead = commit(state.root, "evidence artifacts");

    expect(descendantHead).not.toBe(capturedHead);
    expect(verify(state.root)).not.toThrow();
  });

  it("rejects a captured HEAD from a divergent history", () => {
    const state = fixture();
    cleanupDirs.push(state.root);
    const capturedHead = state.manifest.gitHead;
    commit(state.root, "evidence artifacts");
    const divergentHead = execFileSync(
      "git",
      ["commit-tree", `${capturedHead}^{tree}`, "-p", capturedHead, "-m", "divergent evidence source"],
      { cwd: state.root, encoding: "utf8" },
    ).trim();
    state.manifest.gitHead = divergentHead;
    state.persistManifest();

    expect(verify(state.root)).toThrow(/captured git HEAD is not an ancestor/);
  });

  it("rejects bound-source drift on a valid descendant", () => {
    const state = fixture();
    cleanupDirs.push(state.root);
    commit(state.root, "evidence artifacts");
    const target = path.join(state.root, "src/components/ui/button.tsx");
    writeFileSync(target, `${readFileSync(target, "utf8")}\n// source drift\n`);

    expect(verify(state.root)).toThrow(/source hash mismatch/);
  });

  it("rejects deleted, duplicated, stale, hidden, or mismatched rendered binding witnesses", () => {
    const state = fixture();
    cleanupDirs.push(state.root);
    const assertionsPath = path.join(state.root, state.manifest.assertions.path);
    const assertions = JSON.parse(readFileSync(assertionsPath, "utf8"));
    const originalCoverage = structuredClone(assertions[0].coverage);
    const mutate = (change: (coverage: typeof originalCoverage) => void, diagnostic: RegExp) => {
      assertions[0].coverage = structuredClone(originalCoverage);
      change(assertions[0].coverage);
      writeJson(assertionsPath, assertions);
      state.manifest.assertions.sha256 = hash(readFileSync(assertionsPath));
      state.persistManifest();
      expect(verify(state.root)).toThrow(diagnostic);
    };

    mutate(({ bindings }) => { bindings.pop(); }, /rendered binding count drifted/);
    mutate(({ bindings }) => { bindings.push(structuredClone(bindings[0])); }, /rendered binding count drifted/);
    mutate(({ bindings }) => { bindings[0].state = "stale"; }, /rendered binding owner\/state mismatch/);
    mutate(({ bindings }) => { bindings[0].visible = false; bindings[0].semanticWitness = null; }, /visible or semantic DOM witness/);
    mutate(({ bindings }) => { bindings[0].owner = "stale-owner"; }, /rendered binding owner\/state mismatch/);
    mutate(({ primitives }) => { primitives.pop(); }, /rendered primitive count drifted/);
    mutate(({ primitives }) => { primitives.push(structuredClone(primitives[0])); }, /rendered primitive count drifted/);
    mutate(({ primitives }) => { primitives[0].primitive = "Stale"; }, /rendered primitive mismatch/);
    mutate(({ primitives }) => { primitives[0].visible = false; }, /visible DOM witness/);
  }, 120_000);

  it("rejects removal or alteration of semantic witnesses", () => {
    const state = fixture();
    cleanupDirs.push(state.root);
    const assertionsPath = path.join(state.root, state.manifest.assertions.path);
    const assertions = JSON.parse(readFileSync(assertionsPath, "utf8"));
    const original = structuredClone(assertions[0].coverage);
    const mutate = (change: (coverage: { bindings: Array<{ id: string; semanticWitness?: string | null; visible?: boolean }> }) => void, diagnostic: RegExp) => {
      assertions[0].coverage = structuredClone(original);
      change(assertions[0].coverage);
      writeJson(assertionsPath, assertions);
      state.manifest.assertions.sha256 = hash(readFileSync(assertionsPath));
      state.persistManifest();
      expect(verify(state.root)).toThrow(diagnostic);
    };

    mutate(({ bindings }) => { const b = bindings.find(({ id }) => id === "ds-button-loading"); if (b) b.semanticWitness = "wrong"; }, /visible or semantic DOM witness/);
    mutate(({ bindings }) => { const b = bindings.find(({ id }) => id === "ds-button-hover"); if (b) { b.semanticWitness = null; b.visible = false; } }, /visible or semantic DOM witness/);
    mutate(({ bindings }) => { const b = bindings.find(({ id }) => id === "ds-simple-tabs-selected"); if (b) b.semanticWitness = ""; }, /visible or semantic DOM witness/);
    mutate(({ bindings }) => { const b = bindings.find(({ id }) => id === "ds-copy-field-pending"); if (b) b.semanticWitness = "ready"; }, /visible or semantic DOM witness/);
  }, 120_000);

  it("rejects missing, incomplete, or altered action contrast", () => {
    const state = fixture();
    cleanupDirs.push(state.root);
    const assertionsPath = path.join(state.root, state.manifest.assertions.path);
    const assertions = JSON.parse(readFileSync(assertionsPath, "utf8"));
    const original = structuredClone(assertions[0].actionContrast);
    const mutate = (change: (value: typeof original) => void, diagnostic: RegExp) => {
      assertions[0].actionContrast = structuredClone(original);
      change(assertions[0].actionContrast);
      writeJson(assertionsPath, assertions);
      state.manifest.assertions.sha256 = hash(readFileSync(assertionsPath));
      state.persistManifest();
      expect(verify(state.root)).toThrow(diagnostic);
    };

    mutate(() => { assertions[0].actionContrast = undefined; }, /actionContrast missing/);
    mutate((value) => { delete value["pix-paper"]; }, /actionContrast theme missing/);
    mutate((value) => { value["pix-paper"].button.default.background = "rgb(0,0,0)"; }, /actionContrast Button\/default missing|actionContrast Button\/default ratio failed/);
    mutate((value) => { value["pix-paper"].badge.hover.foreground = "rgb(0,0,0)"; value["pix-paper"].badge.hover.background = "rgb(0,0,0)"; }, /actionContrast linkedBadge\/hover ratio failed/);
  }, 120_000);

  it("rejects stale or divergent deterministic repeat evidence", () => {
    const state = fixture();
    cleanupDirs.push(state.root);
    const originalRepeat = structuredClone(state.manifest.deterministicRepeat);
    state.manifest.deterministicRepeat.lingeringToasts = 1;
    state.persistManifest();
    expect(verify(state.root)).toThrow(/stale UI state or divergent hash/);

    state.manifest.deterministicRepeat = originalRepeat;
    state.persistManifest();
    const repeatPath = path.join(state.root, originalRepeat.path);
    writeFileSync(repeatPath, Buffer.concat([readFileSync(repeatPath), Buffer.from("divergent pixels")]));
    expect(verify(state.root)).toThrow(/deterministic repeat pixels diverged/);
  });

  it("rejects owner, fixture/state, matrix, artifact, authority, assertion and source drift", () => {
    const state = fixture();
    cleanupDirs.push(state.root);
    expect(verify(state.root)).not.toThrow();

    const mutateFile = (relativePath: string, mutation: (value: string) => string, diagnostic: RegExp) => {
      const target = path.join(state.root, relativePath);
      const original = readFileSync(target, "utf8");
      writeFileSync(target, mutation(original));
      expect(verify(state.root)).toThrow(diagnostic);
      writeFileSync(target, original);
    };
    mutateFile("src/components/ui/button.tsx", (value) => `${value}\n// source drift\n`, /source hash mismatch/);
    mutateFile("src/app/design-system/coverage.ts", (value) => value.replace('["button",', '["stale-button",'), /coverage owner inventory|source hash mismatch/);
    mutateFile("src/app/design-system/coverage.ts", (value) => value.replace('"actions", ["default"', '"stale-fixture", ["default"'), /source hash mismatch/);
    mutateFile("src/app/design-system/coverage.ts", (value) => value.replace('["default", "hover"', '["stale-state", "hover"'), /rendered binding owner\/state mismatch|source hash mismatch/);
    mutateFile("docs/frontend-template-parity/obligations.ndjson", (value) => `${value.trim()}\n{}\n`, /canonical parity record count drifted/);

    const originalMatrix = structuredClone(state.manifest.matrix);
    state.manifest.matrix.locales = ["en", "pt-BR"]; state.persistManifest(); expect(verify(state.root)).toThrow(/locale matrix/);
    state.manifest.matrix = structuredClone(originalMatrix); state.manifest.matrix.themes = state.manifest.matrix.themes.slice(0, 5); state.persistManifest(); expect(verify(state.root)).toThrow(/theme matrix/);
    state.manifest.matrix = structuredClone(originalMatrix); state.manifest.matrix.viewports = [320, 375, 768]; state.persistManifest(); expect(verify(state.root)).toThrow(/viewport matrix/);
    state.manifest.matrix = originalMatrix; state.persistManifest();

    const png = path.join(state.root, state.manifest.pngs[0].path);
    const originalPng = readFileSync(png); writeFileSync(png, Buffer.concat([originalPng, Buffer.from("drift")])); expect(verify(state.root)).toThrow(/PNG integrity/); writeFileSync(png, originalPng);

    const assertionsPath = path.join(state.root, state.manifest.assertions.path);
    const assertions = JSON.parse(readFileSync(assertionsPath, "utf8")); assertions[0].locale = "stale-locale"; writeJson(assertionsPath, assertions);
    state.manifest.assertions.sha256 = hash(readFileSync(assertionsPath)); state.persistManifest(); expect(verify(state.root)).toThrow(/assertion matrix/);
  }, 120_000);
});

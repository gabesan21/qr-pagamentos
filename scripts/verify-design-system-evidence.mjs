import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { checkDesignSystemCoverage } from "./check-design-system-coverage.mjs";

const root = process.cwd();
const artifactRoot = join(root, "artifacts/design-system");
const locales = ["pt-BR", "en"];
const themes = ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"];
const viewports = [320, 375, 768, 1440];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(`DESIGN_SYSTEM_EVIDENCE ${message}`); };
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();

function isAncestor(ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { cwd: root, stdio: "pipe" });
    return true;
  } catch (error) {
    if (error?.status === 1) return false;
    throw error;
  }
}

const coverage = await checkDesignSystemCoverage();
const current = JSON.parse(await readFile(join(artifactRoot, "current.json"), "utf8"));
assert(/^\d{14}$/.test(current.runId), "current run ID is invalid");
assert(current.manifest === `artifacts/design-system/${current.runId}/manifest.json`, "current manifest path is not run-bound");
const manifestBytes = await readFile(join(root, current.manifest));
assert(sha256(manifestBytes) === current.manifestSha256, "current manifest hash mismatch");
const manifest = JSON.parse(manifestBytes);
assert(manifest.schemaVersion === 3, "manifest schema is not v3");
assert(manifest.runId === current.runId && manifest.startedAt === current.startedAt, "current pointer identity mismatch");
assert(/^[a-f0-9]{40,64}$/.test(manifest.gitHead), "captured git HEAD is invalid");
const currentGitHead = git("rev-parse", "HEAD");
assert(isAncestor(manifest.gitHead, currentGitHead), "captured git HEAD is not an ancestor of the current HEAD");
assert(JSON.stringify(manifest.matrix?.locales) === JSON.stringify(locales), "locale matrix is incomplete or reordered");
assert(JSON.stringify(manifest.matrix?.themes) === JSON.stringify(themes), "theme matrix is incomplete or reordered");
assert(JSON.stringify(manifest.matrix?.viewports) === JSON.stringify(viewports), "viewport matrix is incomplete or reordered");
assert(manifest.matrix?.captures === 48, "matrix does not contain exactly 48 captures");
const expectedPngs = locales.flatMap((locale) => themes.flatMap((theme) => viewports.map((width) => `artifacts/design-system/${current.runId}/design-system-${locale}-${theme}-${width}.png`))).sort();
assert(manifest.pngs?.length === 48 && new Set(manifest.pngs.map(({ path }) => path)).size === 48, "PNG capture count or uniqueness failed");
assert(JSON.stringify(manifest.pngs.map(({ path }) => path).sort()) === JSON.stringify(expectedPngs), "PNG matrix paths are not exact");
for (const png of manifest.pngs) {
  const [bytes, metadata] = await Promise.all([readFile(join(root, png.path)), stat(join(root, png.path))]);
  assert(metadata.size === png.bytes && metadata.size > 0 && sha256(bytes) === png.sha256, `PNG integrity failed: ${png.path}`);
  assert(metadata.mtimeMs >= Date.parse(manifest.startedAt), `capture predates run: ${png.path}`);
}
const assertionBytes = await readFile(join(root, manifest.assertions.path));
assert(sha256(assertionBytes) === manifest.assertions.sha256, "assertion file hash mismatch");
const assertions = JSON.parse(assertionBytes);
assert(assertions.length === 48, "assertion count is not 48");
const expectedKeys = locales.flatMap((locale) => themes.flatMap((theme) => viewports.map((width) => `${locale}:${theme}:${width}`))).sort();
assert(JSON.stringify(assertions.map(({ locale, theme, width }) => `${locale}:${theme}:${width}`).sort()) === JSON.stringify(expectedKeys), "assertion matrix is incomplete or duplicate");
for (const record of assertions) {
  const context = `${record.locale}/${record.theme}/${record.width}`;
  assert(record.localeState?.lang === record.locale && record.localeState?.locale === record.locale, `locale/lang mismatch: ${context}`);
  assert(Array.isArray(record.localeState?.sections) && record.localeState.sections.length > 0, `specimen sections missing: ${context}`);
  assert(record.localeState?.overflow === false, `horizontal overflow: ${context}`);
  assert(record.fullMotion?.duration === ".18s" && record.fullMotion?.iteration === "1", `full-motion contract failed: ${context}`);
  assert(record.reducedMotion?.duration === ".01ms" && record.reducedMotion?.iteration === "1", `reduced-motion contract failed: ${context}`);
  assert(record.interaction?.toast && record.interaction?.modalFocusLoop && record.interaction?.confirmation && record.interaction?.tabSelection, `interaction probe missing: ${context}`);
  assert(record.severeAxe?.length === 0, `serious/critical axe finding: ${context}`);
  assert(record.focus?.length > 0 && record.focus.every(({ visible, focusVisible, width, height, outline, ring }) => visible && focusVisible && width >= 44 && height >= 44 && (outline >= 2 || ring)), `keyboard focus / 44px target failed: ${context}`);
}
const sectionSets = new Map(locales.map((locale) => [locale, [...new Set(assertions.filter((record) => record.locale === locale).flatMap((record) => record.localeState.sections))].sort()]));
assert(JSON.stringify(sectionSets.get("pt-BR")) === JSON.stringify(sectionSets.get("en")), "locale section equivalence failed");
for (const source of manifest.sources ?? []) assert(sha256(await readFile(join(root, source.path))) === source.sha256, `source hash mismatch: ${source.path}`);
const files = await readdir(join(artifactRoot, current.runId));
assert(files.length === 51 && files.filter((file) => file.endsWith(".png")).length === 48 && files.includes("assertions.json") && files.includes("manifest.json") && files.includes("review.md"), "run artifact inventory is incomplete");
const review = await readFile(join(artifactRoot, current.runId, "review.md"), "utf8");
assert(review.includes(`Run: ${current.runId}`) && review.includes(`Manifest SHA-256: ${current.manifestSha256}`) && /Unresolved severity 2(?:–|-)4:\s*none/i.test(review), "visual review is not current or has unresolved severity 2+");
console.log(`Verified design-system evidence ${current.runId} captures=48 coverage=${coverage.entries}/${coverage.states}`);

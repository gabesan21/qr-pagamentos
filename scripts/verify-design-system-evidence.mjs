import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const root = process.cwd();
const artifactRoot = join(root, "artifacts", "design-system");
const tokenRoot = join(root, "src", "design-system", "tokens");
const expectedThemes = ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"];
const expectedViewports = [320, 375, 768, 1440];
const fixedSources = [
  "package.json",
  "pnpm-lock.yaml",
  "scripts/verify-design-system-evidence.mjs",
  "src/app/design-system/page.tsx",
  "src/app/globals.css",
  "src/brand/assets.manifest.json",
  "src/design-system/fonts/provenance.json",
  "tests/design-system.evidence.spec.ts",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function relativePath(path) {
  return relative(root, path).split(sep).join("/");
}

async function tokenPaths() {
  const entries = await readdir(tokenRoot, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => relativePath(join(entry.parentPath, entry.name)))
    .sort();
}

async function parse(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const currentPath = join(artifactRoot, "current.json");
const current = await parse(currentPath);
assert(/^\d{14}$/.test(current.runId), "Current evidence pointer has an invalid run ID.");
assert(current.manifest === `artifacts/design-system/${current.runId}/manifest.json`, "Current pointer does not target its run manifest.");
const manifestPath = join(root, current.manifest);
const manifestBytes = await readFile(manifestPath);
assert(sha256(manifestBytes) === current.manifestSha256, "Current pointer manifest hash mismatch.");
const manifest = JSON.parse(manifestBytes);
assert(manifest.schemaVersion === 2, "Evidence manifest schema is not v2.");
assert(manifest.runId === current.runId && manifest.startedAt === current.startedAt, "Current pointer and manifest identity differ.");
assert(manifest.matrix?.captures === 24, "Evidence manifest does not name exactly 24 captures.");
assert(JSON.stringify(manifest.matrix?.themes) === JSON.stringify(expectedThemes), "Evidence theme inventory is incomplete or reordered.");
assert(JSON.stringify(manifest.matrix?.viewports) === JSON.stringify(expectedViewports), "Evidence viewport inventory is incomplete or reordered.");
assert(manifest.fallback?.actual === manifest.fallback?.expected, "Unknown-theme fallback does not match pix-paper.");

const expectedCaptures = expectedThemes.flatMap((theme) => expectedViewports.map((width) => `artifacts/design-system/${current.runId}/design-system-${theme}-${width}.png`)).sort();
const pngPaths = manifest.pngs.map(({ path }) => path).sort();
assert(manifest.pngs.length === 24 && new Set(pngPaths).size === 24, "Evidence manifest has duplicate or missing PNG entries.");
assert(JSON.stringify(pngPaths) === JSON.stringify(expectedCaptures), "Evidence capture matrix paths are not exact.");
for (const png of manifest.pngs) {
  const [contents, metadata] = await Promise.all([readFile(join(root, png.path)), stat(join(root, png.path))]);
  assert(metadata.size > 0 && metadata.size === png.bytes, `Capture size mismatch: ${png.path}`);
  assert(sha256(contents) === png.sha256, `Capture hash mismatch: ${png.path}`);
  assert(metadata.mtimeMs >= Date.parse(manifest.startedAt), `Capture predates its run: ${png.path}`);
}

assert(manifest.assertions?.path === `artifacts/design-system/${current.runId}/assertions.json`, "Assertions path is not bound to the current run.");
const assertionBytes = await readFile(join(root, manifest.assertions.path));
assert(sha256(assertionBytes) === manifest.assertions.sha256, "Evidence assertions hash mismatch.");
const assertions = JSON.parse(assertionBytes);
assert(assertions.length === 24, "Evidence assertions do not contain exactly 24 matrix entries.");
const assertionKeys = assertions.map(({ theme, width }) => `${theme}:${width}`).sort();
const expectedKeys = expectedThemes.flatMap((theme) => expectedViewports.map((width) => `${theme}:${width}`)).sort();
assert(JSON.stringify(assertionKeys) === JSON.stringify(expectedKeys), "Evidence assertions do not cover the exact theme/viewport matrix.");
for (const result of assertions) {
  const context = `${result.theme}/${result.width}`;
  assert(JSON.stringify(result.measured?.themeTokens) === JSON.stringify(result.expectedThemeTokens), `Runtime theme token mismatch at ${context}.`);
  assert(result.measured?.commonTokens?.["color-text-tertiary"] === undefined, `Theme-only tertiary token leaked into common tokens at ${context}.`);
  assert(JSON.stringify(result.measured?.commonTokens) === JSON.stringify({
    "radius-tight": "6px",
    "radius-control": "8px",
    "radius-panel": "10px",
    "radius-pill": "999px",
    "focus-width": "3px",
    "focus-offset": "2px",
    "font-interface": "Inter, system-ui, sans-serif",
    "font-display": "Sora, sans-serif",
    "font-numeric": '"IBM Plex Mono", monospace',
    "tracking-display": "-.02em",
  }), `Common radius/focus/type token mismatch at ${context}.`);
  assert(result.expectedThemeTokens?.["color-text-tertiary"], `Tertiary semantic color is missing at ${context}.`);
  assert(result.expectedThemeTokens?.["color-focus-ring"] && result.expectedThemeTokens?.["shadow-elevation-card"], `Focus/elevation semantics are missing at ${context}.`);
  assert(JSON.stringify(result.measured?.typography?.body) === JSON.stringify({ family: "Inter, system-ui, sans-serif", size: "14px", lineHeight: "20px", weight: "400" }), `Inter body contract failed at ${context}.`);
  assert(JSON.stringify(result.measured?.typography?.heading) === JSON.stringify({ family: "Sora, sans-serif", size: "24px", lineHeight: "32px", weight: "400", letterSpacing: "-0.48px" }), `Sora heading contract failed at ${context}.`);
  assert(result.measured?.typography?.numeric?.length === 4, `Numeric specimen inventory failed at ${context}.`);
  assert(result.measured.typography.numeric.every(({ family, variantNumeric, weight }) => family === '"IBM Plex Mono", monospace' && variantNumeric === "tabular-nums" && weight === "400"), `IBM Plex Mono numeric contract failed at ${context}.`);
  assert(JSON.stringify(result.measured?.typography?.loaded) === JSON.stringify({ inter: true, sora: true, plexMono: true }), `Local font readiness failed at ${context}.`);
  assert(JSON.stringify(result.fullMotion) === JSON.stringify({ duration: ".18s", iteration: "1" }), `Full-motion contract failed at ${context}.`);
  assert(JSON.stringify(result.reducedMotion) === JSON.stringify({ duration: ".01ms", iteration: "1", animationDuration: "1e-05s", animationIterationCount: "1" }), `Reduced-motion contract failed at ${context}.`);
  assert(result.measured?.overflow === false, `Horizontal overflow found at ${context}.`);
  assert(result.measured?.semanticContrast?.primaryText >= 4.5 && result.measured?.semanticContrast?.tertiaryText >= 4.5 && result.measured?.semanticContrast?.action >= 4.5, `Semantic contrast failed at ${context}.`);
  assert(result.measured?.focusRing === result.measured?.themeTokens?.["color-focus-ring"], `Focus semantic token mismatch at ${context}.`);
  assert(Object.values(result.measured?.focusContrast ?? {}).length === 3 && Object.values(result.measured.focusContrast).every((ratio) => ratio >= 3), `Composited focus contrast failed at ${context}.`);
  assert(result.severeAxe?.length === 0, `Serious/critical axe finding at ${context}.`);
  assert(result.focusTraversal?.length > 0 && result.focusTraversal.every(({ focusVisible, visible, outlineWidth, outlineColor, ringVisible, ringColor }) => focusVisible && visible && (outlineWidth >= 2 || ringVisible) && (outlineWidth >= 2 ? outlineColor === result.measured.focusRing : ringColor === result.measured.focusRing)), `Keyboard focus evidence failed at ${context}.`);
}

const expectedTokenPaths = await tokenPaths();
const tokenManifestPaths = manifest.tokenFiles?.map(({ path }) => path).sort();
assert(JSON.stringify(tokenManifestPaths) === JSON.stringify(expectedTokenPaths), "Canonical token source inventory is incomplete or stale.");
const expectedSourcePaths = [...fixedSources, ...expectedTokenPaths].sort();
const sourcePaths = manifest.sources?.map(({ path }) => path).sort();
assert(JSON.stringify(sourcePaths) === JSON.stringify(expectedSourcePaths), "Evidence source inventory is incomplete or stale.");
assert(manifest.fontProvenance?.path === "src/design-system/fonts/provenance.json", "Font provenance is not explicitly bound.");
assert(manifest.brandManifest?.path === "src/brand/assets.manifest.json", "Brand manifest is not explicitly bound.");
for (const source of manifest.sources) {
  assert(sha256(await readFile(join(root, source.path))) === source.sha256, `Evidence source hash mismatch: ${source.path}`);
}

const runFiles = (await readdir(join(artifactRoot, current.runId))).sort();
assert(runFiles.length === 27, `Current evidence run must contain 27 files, found ${runFiles.length}.`);
assert(runFiles.filter((file) => file.endsWith(".png")).length === 24, "Current evidence run does not contain exactly 24 PNGs.");
assert(runFiles.includes("assertions.json") && runFiles.includes("manifest.json") && runFiles.includes("review.md"), "Current evidence run lacks assertions, manifest, or review.");
const review = await readFile(join(artifactRoot, current.runId, "review.md"), "utf8");
assert(review.includes(`Run: ${manifest.runId}`), "Visual review is not bound to the current run ID.");
assert(review.includes(`Manifest SHA-256: ${current.manifestSha256}`), "Visual review is not bound to the current manifest hash.");
assert(/Unresolved severity 2(?:–|-)4:\s*none/i.test(review), "Visual review still has an unresolved severity 2+ finding.");

console.log(`Verified design-system evidence ${manifest.runId}`);

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import {
  parseIcoFrames,
  requiredThemeIds,
  validateManifestContract,
  validateSafeSvg,
} from "./brand-contract.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifactRoot = join(root, "artifacts", "brand-assets");
const expectedWidths = [320, 375, 768, 1440];
const evidenceSources = [
  "scripts/run-brand-assets-evidence.mjs",
  "scripts/verify-brand-assets-evidence.mjs",
  "src/brand/assets.manifest.json",
  "src/brand/brand-identity.tsx",
  "tests/brand-assets.evidence.spec.ts",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function parse(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function actualFile(path) {
  const bytes = await readFile(join(root, path));
  return { path, bytes, byteLength: bytes.length, sha256: hash(bytes) };
}

async function verifySource(source) {
  const actual = await actualFile(source.sourcePath);
  assert(actual.byteLength === source.bytes, `Source byte count drift: ${source.sourcePath}`);
  assert(actual.sha256 === source.sha256, `Source hash drift: ${source.sourcePath}`);
  const parsed = validateSafeSvg(actual.bytes.toString("utf8"), {
    allowSourceText: source.sourcePath.endsWith("/logo.svg"),
    expectedViewBox: source.viewBox,
  });
  assert(parsed.width === source.intrinsic.width && parsed.height === source.intrinsic.height,
    `Source intrinsic dimensions drift: ${source.sourcePath}`);
}

async function verifyDerivative(derivative) {
  const actual = await actualFile(derivative.outputPath);
  assert(actual.byteLength === derivative.bytes, `Derivative byte count drift: ${derivative.outputPath}`);
  assert(actual.sha256 === derivative.sha256, `Derivative hash drift: ${derivative.outputPath}`);
  assert(!derivative.outputPath.startsWith("src/media/") && !derivative.outputPath.includes("merchant-media"),
    `Application asset crossed the merchant-media boundary: ${derivative.outputPath}`);
  if (derivative.mime === "image/svg+xml") {
    const expectedViewBox = derivative.intrinsic.viewBox;
    validateSafeSvg(actual.bytes.toString("utf8"), { expectedViewBox, generated: true });
    return;
  }
  if (derivative.mime === "image/png") {
    const metadata = await sharp(actual.bytes).metadata();
    assert(metadata.width === derivative.intrinsic.width && metadata.height === derivative.intrinsic.height,
      `PNG dimensions drift: ${derivative.outputPath}`);
    return;
  }
  const frames = parseIcoFrames(actual.bytes);
  assert(JSON.stringify(frames.map(({ width }) => width).sort((a, b) => a - b)) === JSON.stringify([16, 32, 48]),
    "Favicon frame inventory drifted.");
  for (const frame of frames) {
    assert(frame.sha256 === derivative.frameSha256[String(frame.width)],
      `Favicon frame hash drift: ${frame.width}`);
  }
}

export async function verifyIntegratedInventory(manifest) {
  validateManifestContract(manifest);
  assert(manifest.provenance?.projectUseAuthorized === true, "Project-use grant is absent.");
  assert(manifest.usage?.mediaBoundary?.includes("no upload") &&
    manifest.usage.mediaBoundary.includes("merchant ownership") &&
    manifest.usage.mediaBoundary.includes("media identifier"), "Merchant-media boundary statement is incomplete.");
  assert(manifest.sources.length === 17 && manifest.derivatives.length === 28,
    "Integrated source/derivative counts are not closed.");
  await Promise.all(manifest.sources.map(verifySource));
  await Promise.all(manifest.derivatives.map(verifyDerivative));
  assert(JSON.stringify(manifest.derivatives.filter(({ role }) => role === "theme-swatch")
    .map(({ themeId }) => themeId).sort()) === JSON.stringify([...requiredThemeIds].sort()),
  "Theme swatch identifiers drifted.");
}

async function main() {
  const currentPath = join(artifactRoot, "current.json");
  const current = await parse(currentPath);
  assert(/^\d{14}$/.test(current.runId), "Current brand-assets run ID is invalid.");
  assert(current.manifest === `artifacts/brand-assets/${current.runId}/manifest.json`,
    "Current brand-assets pointer does not target its run manifest.");
  const manifestBytes = await readFile(join(root, current.manifest));
  assert(hash(manifestBytes) === current.manifestSha256, "Current brand-assets manifest hash mismatch.");
  const manifest = JSON.parse(manifestBytes);
  assert(manifest.schemaVersion === 2 && manifest.runId === current.runId &&
    manifest.startedAt === current.startedAt, "Brand-assets manifest identity is incoherent.");
  assert(JSON.stringify(manifest.matrix?.widths) === JSON.stringify(expectedWidths) &&
    manifest.matrix?.captures === 4, "Brand-assets viewport matrix is incomplete.");
  assert(manifest.coverage?.sourceRoles === 17 && manifest.coverage?.directPairs === 16 &&
    manifest.coverage?.identityVariants === 8 && manifest.coverage?.swatches === 6 &&
    JSON.stringify(manifest.coverage?.faviconFrames) === JSON.stringify([16, 32, 48]),
  "Brand-assets coverage counts are incomplete.");
  assert(manifest.rasterPolicy?.threshold === 0.1 && manifest.rasterPolicy?.maxDifferingPixelRatio === 0.001,
    "Brand-assets raster policy drifted.");
  assert(manifest.rasterPolicy?.logoComparison ===
    "full 160x32 pinned Sora target: exact QR threshold plus complete x=40..159 wordmark geometry",
  "Complete logo derivation comparison is not explicit.");
  assert(JSON.stringify(manifest.rasterPolicy?.wordmarkDerivationTolerance) === JSON.stringify({
    radius: 2, maxUnmatchedRatio: 0.12, inkRatio: [0.75, 1.3], maxBoundingBoxDelta: 2,
  }), "Wordmark derivation tolerance drifted.");

  const brandManifest = await parse(join(root, "src/brand/assets.manifest.json"));
  await verifyIntegratedInventory(brandManifest);
  const pinnedFont = brandManifest.provenance.wordmark.packageSource;
  const expectedFontPath = `node_modules/${pinnedFont.package}/${pinnedFont.file}`;
  assert(JSON.stringify(manifest.fontSource) === JSON.stringify({
    path: expectedFontPath, package: pinnedFont.package, version: pinnedFont.version,
    file: pinnedFont.file, sha256: pinnedFont.sha256, loaded: true,
  }), "Pinned Sora evidence source binding drifted.");
  assert(hash(await readFile(join(root, expectedFontPath))) === pinnedFont.sha256,
    "Pinned Sora evidence bytes drifted.");

  const expectedScreenshots = expectedWidths.map((width) =>
    `artifacts/brand-assets/${current.runId}/brand-assets-${width}.png`).sort();
  assert(JSON.stringify(manifest.screenshots.map(({ path }) => path).sort()) === JSON.stringify(expectedScreenshots),
    "Brand-assets screenshot paths are incomplete or stale.");
  for (const screenshot of manifest.screenshots) {
    const bytes = await readFile(join(root, screenshot.path));
    const metadata = await stat(join(root, screenshot.path));
    const image = await sharp(bytes).metadata();
    assert(bytes.length === screenshot.bytes && hash(bytes) === screenshot.sha256,
      `Screenshot byte/hash mismatch: ${screenshot.path}`);
    assert(image.width === screenshot.width && image.width === Number(screenshot.path.match(/-(\d+)\.png$/)?.[1]),
      `Screenshot width mismatch: ${screenshot.path}`);
    assert(metadata.mtimeMs >= Date.parse(manifest.startedAt), `Screenshot predates run: ${screenshot.path}`);
  }

  const assertionsBytes = await readFile(join(root, manifest.assertions.path));
  assert(hash(assertionsBytes) === manifest.assertions.sha256, "Brand-assets assertions hash mismatch.");
  const assertions = JSON.parse(assertionsBytes);
  assert(assertions.length === 4 && JSON.stringify(assertions.map(({ width }) => width)) === JSON.stringify(expectedWidths),
    "Brand-assets assertions do not cover the exact viewport matrix.");
  for (const result of assertions) {
    assert(result.sourceRoles === 17 && result.identityVariants === 8 && result.swatches === 6,
      `Asset coverage failed at ${result.width}px.`);
    assert(result.overflow === false && result.externalRequests.length === 0 &&
      result.consoleErrors.length === 0 && result.pageErrors.length === 0,
    `Browser isolation/overflow failed at ${result.width}px.`);
    assert(result.seriousAxe.length === 0 && result.imagesReady === true && result.sora700Loaded === true,
      `Accessibility/image readiness failed at ${result.width}px.`);
  }
  const directComparisons = manifest.comparisons.filter(({ mode }) => mode === "full-raster");
  assert(directComparisons.length === 16 && directComparisons.every(({ differingPixelRatio, passed }) =>
    passed === true && differingPixelRatio <= 0.001), "Direct source/output raster comparison failed.");
  const logoComparison = manifest.comparisons.find(({ mode }) =>
    mode === "full-pinned-sora-target-vs-outlined-derivative");
  assert(manifest.comparisons.length === 17 && logoComparison?.fontLoaded === true &&
    logoComparison.fontSha256 === pinnedFont.sha256 && logoComparison.qr?.passed === true &&
    logoComparison.qr?.differingPixelRatio <= 0.001 && logoComparison.wordmark?.passed === true &&
    JSON.stringify(logoComparison.wordmark?.crop) === JSON.stringify({ left: 40, top: 0, width: 120, height: 32 }) &&
    logoComparison.structuralWordmark === "outlined/no-live-text-or-font",
  "Complete pinned-Sora target/outline comparison failed.");

  const probesBytes = await readFile(join(root, manifest.mutationProbes.path));
  assert(hash(probesBytes) === manifest.mutationProbes.sha256, "Mutation-probe hash mismatch.");
  const probes = JSON.parse(probesBytes);
  const requiredProbes = [
    "missing-asset", "stale-asset", "unknown-asset", "altered-source-hash",
    "altered-output-hash", "wrong-viewbox", "wrong-favicon-frame", "wrong-theme-id",
    "duplicate-bytes", "unsafe-svg", "live-text-font", "absent-grant", "merchant-media-classification",
    "altered-wordmark-geometry",
  ];
  assert(JSON.stringify(probes.map(({ id }) => id).sort()) === JSON.stringify(requiredProbes.sort()) &&
    probes.every(({ failedClosed }) => failedClosed === true), "Mutation probes are incomplete or did not fail closed.");

  const expectedSourcePaths = [...evidenceSources, ...brandManifest.sources.map(({ sourcePath }) => sourcePath),
    ...brandManifest.derivatives.map(({ outputPath }) => outputPath)].sort();
  assert(JSON.stringify(manifest.sources.map(({ path }) => path).sort()) === JSON.stringify(expectedSourcePaths),
    "Evidence source binding inventory is incomplete.");
  for (const source of manifest.sources) {
    assert(hash(await readFile(join(root, source.path))) === source.sha256,
      `Evidence source hash mismatch: ${source.path}`);
  }

  const runFiles = (await readdir(join(artifactRoot, current.runId))).sort();
  assert(JSON.stringify(runFiles) === JSON.stringify([
    ...expectedWidths.map((width) => `brand-assets-${width}.png`),
    "assertions.json", "manifest.json", "mutation-probes.json", "review.md",
  ].sort()), "Brand-assets run directory is not closed.");
  const review = await readFile(join(artifactRoot, current.runId, "review.md"), "utf8");
  assert(review.includes(`Run: ${manifest.runId}`) && review.includes(`Manifest SHA-256: ${current.manifestSha256}`),
    "Brand-assets visual review is not bound to the current manifest.");
  assert(/Unresolved severity 2(?:–|-)4:\s*none/i.test(review),
    "Brand-assets visual review has an unresolved severity 2+ finding.");
  console.log(`Verified brand-assets evidence ${manifest.runId}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}

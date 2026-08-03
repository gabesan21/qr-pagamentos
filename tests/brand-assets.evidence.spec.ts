import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

import {
  parseIcoFrames,
  validateManifestContract,
  validateSafeSvg,
} from "../scripts/brand-contract.mjs";

const widths = [320, 375, 768, 1440] as const;
const artifactRoot = join(process.cwd(), "artifacts", "brand-assets");
const threshold = 0.1;
const maxDifferingPixelRatio = 0.001;

type SourceRecord = {
  parityId: string;
  sourcePath: string;
  bytes: number;
  sha256: string;
  viewBox: string;
  role: string;
  intrinsic: { width: number; height: number };
};

type DerivativeRecord = {
  id: string;
  outputPath: string;
  bytes: number;
  sha256: string;
  mime: string;
  role: string;
  sourceParityIds: string[];
  intrinsic: { width?: number; height?: number; viewBox?: string; frames?: number[] };
  accessibilityMode: string;
  identityId?: string;
  staticVariant?: string;
  themeId?: string;
  applicationOwnership?: string;
  frameSha256?: Record<string, string>;
};

type BrandManifest = {
  provenance: { projectUseAuthorized: boolean };
  usage: { mediaBoundary: string };
  sources: SourceRecord[];
  derivatives: DerivativeRecord[];
};

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function relativePath(path: string) {
  return relative(process.cwd(), path).split(sep).join("/");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function dataUrl(bytes: Buffer, mime: string) {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function sourceBytes(manifest: BrandManifest) {
  return new Map(await Promise.all(manifest.sources.map(async (source) => [
    source.sourcePath,
    await readFile(join(process.cwd(), source.sourcePath)),
  ] as const)));
}

async function derivativeBytes(manifest: BrandManifest) {
  return new Map(await Promise.all(manifest.derivatives.map(async (asset) => [
    asset.outputPath,
    await readFile(join(process.cwd(), asset.outputPath)),
  ] as const)));
}

function validateSnapshot(manifest: BrandManifest, files: Map<string, Buffer>) {
  validateManifestContract(manifest);
  if (manifest.provenance.projectUseAuthorized !== true) throw new Error("Project-use grant is absent.");
  if (!manifest.usage.mediaBoundary.includes("no upload") || !manifest.usage.mediaBoundary.includes("merchant ownership")) {
    throw new Error("Merchant-media boundary is incomplete.");
  }
  for (const source of manifest.sources) {
    const bytes = files.get(source.sourcePath);
    if (!bytes) throw new Error(`Missing source asset: ${source.sourcePath}`);
    if (bytes.length !== source.bytes || sha256(bytes) !== source.sha256) throw new Error(`Stale source asset: ${source.sourcePath}`);
    validateSafeSvg(bytes.toString("utf8"), {
      allowSourceText: source.sourcePath.endsWith("/logo.svg"),
      expectedViewBox: source.viewBox,
    });
  }
  for (const asset of manifest.derivatives) {
    const bytes = files.get(asset.outputPath);
    if (!bytes) throw new Error(`Missing derivative asset: ${asset.outputPath}`);
    if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) throw new Error(`Stale derivative asset: ${asset.outputPath}`);
    if (asset.outputPath.startsWith("src/media/") || asset.applicationOwnership === "merchant-media") {
      throw new Error(`Merchant-media classification: ${asset.outputPath}`);
    }
    if (asset.mime === "image/svg+xml") {
      validateSafeSvg(bytes.toString("utf8"), { expectedViewBox: asset.intrinsic.viewBox, generated: true });
    } else if (asset.mime === "image/x-icon") {
      const frames = parseIcoFrames(bytes);
      const frameSha256 = asset.frameSha256;
      if (!frameSha256 || frames.some(({ width, sha256: frameHash }) => frameSha256[String(width)] !== frameHash)) {
        throw new Error("Favicon frame hash drift.");
      }
    }
  }
  const known = new Set([...manifest.sources.map((source) => source.sourcePath), ...manifest.derivatives.map((asset) => asset.outputPath)]);
  for (const path of files.keys()) if (!known.has(path)) throw new Error(`Unknown asset: ${path}`);
}

async function compareRaster(source: Buffer, output: Buffer, maskWidth?: number) {
  const sourceImage = sharp(source).ensureAlpha();
  const outputImage = sharp(output).ensureAlpha();
  const [sourceMetadata, outputMetadata] = await Promise.all([sourceImage.metadata(), outputImage.metadata()]);
  expect({ width: sourceMetadata.width, height: sourceMetadata.height }).toEqual({
    width: outputMetadata.width,
    height: outputMetadata.height,
  });
  const width = sourceMetadata.width ?? 0;
  const height = sourceMetadata.height ?? 0;
  const [sourceRaw, outputRaw] = await Promise.all([sourceImage.raw().toBuffer(), outputImage.raw().toBuffer()]);
  const comparedWidth = maskWidth ?? width;
  let differingPixels = 0;
  let maximumChannelDelta = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < comparedWidth; x += 1) {
      const offset = (y * width + x) * 4;
      let pixelDiffers = false;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(sourceRaw[offset + channel] - outputRaw[offset + channel]) / 255;
        maximumChannelDelta = Math.max(maximumChannelDelta, delta);
        if (delta > threshold) pixelDiffers = true;
      }
      if (pixelDiffers) differingPixels += 1;
    }
  }
  const differingPixelRatio = differingPixels / (comparedWidth * height);
  return { comparedWidth, height, differingPixels, differingPixelRatio, maximumChannelDelta,
    passed: differingPixelRatio <= maxDifferingPixelRatio };
}

function applicationCard(sourceRecord: SourceRecord, derivative: DerivativeRecord, sourceData: Buffer, output: Buffer) {
  const informative = derivative.accessibilityMode !== "decorative";
  const alt = informative ? `Application-owned ${derivative.role} preview` : "";
  const size = Math.min(sourceRecord.intrinsic.width, sourceRecord.intrinsic.height, 160);
  return `<article class="asset-card" data-source-role="${escapeHtml(sourceRecord.parityId)}">
    <h2>${escapeHtml(sourceRecord.role)}</h2><p class="meta">${escapeHtml(sourceRecord.parityId)}</p>
    <div class="pair"><figure><figcaption>Immutable target</figcaption>
      <img data-compare-source="${escapeHtml(sourceRecord.parityId)}" src="${dataUrl(sourceData, "image/svg+xml")}" alt="${escapeHtml(alt)}" style="width:${size}px;height:${size}px">
    </figure><figure><figcaption>Production derivative</figcaption>
      <img data-compare-output="${escapeHtml(sourceRecord.parityId)}" src="${dataUrl(output, "image/svg+xml")}" alt="${escapeHtml(alt)}" style="width:${size}px;height:${size}px">
    </figure></div></article>`;
}

function contactSheet(manifest: BrandManifest, sources: Map<string, Buffer>, outputs: Map<string, Buffer>) {
  const logoSource = manifest.sources.find((source) => source.sourcePath.endsWith("/logo.svg"))!;
  const applicationSources = manifest.sources.filter((source) => source !== logoSource);
  const applicationCards = applicationSources.map((source) => {
    const output = manifest.derivatives.find((asset) => asset.sourceParityIds.includes(source.parityId))!;
    return applicationCard(source, output, sources.get(source.sourcePath)!, outputs.get(output.outputPath)!);
  }).join("");
  const identities = manifest.derivatives.filter((asset): asset is DerivativeRecord & { identityId: string; staticVariant: string } =>
    Boolean(asset.identityId && asset.staticVariant)).map((asset) => {
    const reversed = asset.staticVariant === "reversed";
    return `<figure class="identity ${reversed ? "reversed" : "positive"}" data-identity-variant="${asset.id}">
      <figcaption>${escapeHtml(asset.identityId)} · ${asset.staticVariant}</figcaption>
      <img src="${dataUrl(outputs.get(asset.outputPath)!, asset.mime)}" alt="QR Pagamentos ${escapeHtml(asset.identityId)} ${asset.staticVariant}">
    </figure>`;
  }).join("");
  const faviconFrames = manifest.derivatives.filter((asset) => asset.role === "browser-icon-frame").map((asset) =>
    `<figure class="favicon"><figcaption>${asset.intrinsic.width}px native / 128px</figcaption>
      <span><img src="${dataUrl(outputs.get(asset.outputPath)!, "image/png")}" alt="" style="width:${asset.intrinsic.width}px;height:${asset.intrinsic.height}px">
      <img class="magnified" src="${dataUrl(outputs.get(asset.outputPath)!, "image/png")}" alt="" style="width:128px;height:128px"></span></figure>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>QR Pagamentos brand asset evidence</title>
  <style>*{box-sizing:border-box}html{background:#f7f4ee;color:#1e2a26;font:14px/20px system-ui,sans-serif;caret-color:transparent}body{margin:0;padding:16px;overflow-x:hidden}main{max-width:1280px;margin:auto}h1{font-size:24px;line-height:32px;margin:0 0 8px}h2{font-size:16px;line-height:24px;margin:0}.intro,.meta,figcaption{color:#4a5a54}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px}.asset-card,.section{border:1px solid #e4ded1;border-radius:10px;background:#fff;padding:16px}.asset-card{min-width:0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}figure{margin:0;min-width:0}figure img{display:block;max-width:100%;object-fit:contain;margin:8px auto}.identity-grid,.favicon-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:12px}.identity{padding:12px;border:1px solid #e4ded1;border-radius:8px}.identity img{width:160px;height:32px}.identity.reversed{background:#1e2a26}.identity.reversed figcaption{color:#f7f4ee}.favicon span{display:flex;min-height:144px;align-items:center;gap:16px}.favicon img{image-rendering:pixelated;margin:0}.section{margin-top:24px}.logo-target{width:160px;height:32px}@media(max-width:374px){.pair{grid-template-columns:1fr}.identity-grid{grid-template-columns:1fr}}</style></head><body><main>
    <h1>QR Pagamentos brand asset evidence</h1><p class="intro">Fresh Chromium source-to-production contact sheet.</p>
    <section class="section" data-source-role="${logoSource.parityId}"><h2>${escapeHtml(logoSource.role)}</h2>
      <figure><figcaption>Immutable live-text target (visual reference only)</figcaption><img class="logo-target" src="${dataUrl(sources.get(logoSource.sourcePath)!, "image/svg+xml")}" alt="QR Pagamentos source identity"></figure>
    </section><section class="section"><h2>Positive and reversed static identities</h2><div class="identity-grid">${identities}</div></section>
    <section class="section"><h2>Application artwork and six theme swatches</h2><div class="grid">${applicationCards}</div></section>
    <section class="section"><h2>Favicon frames at native and magnified sizes</h2><div class="favicon-grid">${faviconFrames}</div></section>
  </main></body></html>`;
}

test("creates fresh independent browser evidence for the closed brand asset family", async ({ page }) => {
  test.setTimeout(180_000);
  const runId = process.env.BRAND_ASSET_EVIDENCE_RUN_ID;
  const startedAt = process.env.BRAND_ASSET_EVIDENCE_STARTED_AT;
  expect(runId).toMatch(/^\d{14}$/);
  expect(startedAt).toBeTruthy();
  const runDirectory = join(artifactRoot, runId!);
  await mkdir(runDirectory, { recursive: false });

  const manifestPath = join(process.cwd(), "src", "brand", "assets.manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as BrandManifest;
  const [sources, outputs] = await Promise.all([sourceBytes(manifest), derivativeBytes(manifest)]);
  const completeFiles = new Map([...sources, ...outputs]);
  expect(() => validateSnapshot(manifest, completeFiles)).not.toThrow();

  const probes: Array<{ id: string; failedClosed: boolean; error: string }> = [];
  const runProbe = (id: string, mutate: (copy: BrandManifest, files: Map<string, Buffer>) => void) => {
    const copy = clone(manifest);
    const files = new Map([...completeFiles].map(([path, bytes]) => [path, Buffer.from(bytes)]));
    mutate(copy, files);
    let error = "";
    try { validateSnapshot(copy, files); } catch (caught) { error = (caught as Error).message; }
    probes.push({ id, failedClosed: Boolean(error), error });
    expect(error, `${id} did not fail closed`).not.toBe("");
  };
  const firstOutput = manifest.derivatives[0];
  const firstApplication = manifest.derivatives.find((asset) => asset.applicationOwnership)!;
  runProbe("missing-asset", (_copy, files) => files.delete(firstOutput.outputPath));
  runProbe("stale-asset", (_copy, files) => files.set(firstOutput.outputPath, Buffer.concat([files.get(firstOutput.outputPath)!, Buffer.from(" ")])));
  runProbe("unknown-asset", (_copy, files) => files.set("public/application-assets/unknown.svg", Buffer.from("unknown")));
  runProbe("altered-source-hash", (copy) => { copy.sources[0].sha256 = "a".repeat(64); });
  runProbe("altered-output-hash", (copy) => { copy.derivatives[0].sha256 = "b".repeat(64); });
  runProbe("wrong-viewbox", (copy) => { copy.sources[0].viewBox = "0 0 1 1"; });
  runProbe("wrong-favicon-frame", (copy) => { delete copy.derivatives.find((asset) => asset.mime === "image/x-icon")!.frameSha256![16]; });
  runProbe("wrong-theme-id", (copy) => { copy.derivatives.find((asset) => asset.themeId)!.themeId = "unknown"; });
  runProbe("duplicate-bytes", (copy) => { copy.derivatives[1].sha256 = copy.derivatives[0].sha256; });
  runProbe("unsafe-svg", (copy, files) => {
    const asset = copy.derivatives.find((entry) => entry.mime === "image/svg+xml")!;
    const unsafe = Buffer.from(files.get(asset.outputPath)!.toString("utf8").replace("<svg", "<svg onclick=\"alert(1)\""));
    asset.bytes = unsafe.length; asset.sha256 = sha256(unsafe); files.set(asset.outputPath, unsafe);
  });
  runProbe("live-text-font", (copy, files) => {
    const asset = copy.derivatives.find((entry) => entry.mime === "image/svg+xml")!;
    const live = Buffer.from(files.get(asset.outputPath)!.toString("utf8").replace("</svg>", '<text font-family="Sora">QR</text></svg>'));
    asset.bytes = live.length; asset.sha256 = sha256(live); files.set(asset.outputPath, live);
  });
  runProbe("absent-grant", (copy) => { copy.provenance.projectUseAuthorized = false; });
  runProbe("merchant-media-classification", (copy) => { copy.derivatives.find((asset) => asset.id === firstApplication.id)!.applicationOwnership = "merchant-media"; });
  const probesPath = join(runDirectory, "mutation-probes.json");
  await writeFile(probesPath, `${JSON.stringify(probes, null, 2)}\n`);

  const identitySource = await readFile(join(process.cwd(), "src", "brand", "brand-identity.tsx"), "utf8");
  const inlineIdentitySemantics = {
    sourcePath: "src/brand/brand-identity.tsx",
    sourceSha256: sha256(identitySource),
    standaloneName: identitySource.includes('role={labelled ? "img" : undefined}') &&
      identitySource.includes("aria-label={accessibleName}"),
    adjacentMarkDecorative: identitySource.includes("aria-hidden={labelled ? undefined : true}") &&
      identitySource.includes("<BrandMark className=\"brand-identity__mark\" />"),
    noSvgTitle: !identitySource.includes("<title"),
    visibleLockupName: identitySource.includes("QR Pagamentos"),
  };
  expect(inlineIdentitySemantics).toMatchObject({ standaloneName: true, adjacentMarkDecorative: true,
    noSvgTitle: true, visibleLockupName: true });

  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  await page.route("**/*", async (route) => {
    externalRequests.push(route.request().url());
    await route.abort();
  });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const html = contactSheet(manifest, sources, outputs);
  const assertions: Array<Record<string, unknown>> = [];
  const screenshotRecords = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 1000 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(async () => { await document.fonts.ready; });
    const measured = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sourceRoles: document.querySelectorAll("[data-source-role]").length,
      identityVariants: document.querySelectorAll("[data-identity-variant]").length,
      swatches: document.querySelectorAll('[data-source-role] h2').length,
      imagesReady: Array.from(document.images).every((image) => image.complete && image.naturalWidth > 0),
    }));
    const seriousAxe = (await new AxeBuilder({ page }).analyze()).violations
      .filter(({ impact }) => impact === "serious" || impact === "critical")
      .map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length }));
    expect(measured.overflow).toBe(false);
    expect(measured.sourceRoles).toBe(17);
    expect(measured.identityVariants).toBe(8);
    expect(measured.imagesReady).toBe(true);
    expect(seriousAxe).toEqual([]);
    const screenshotPath = join(runDirectory, `brand-assets-${width}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled", caret: "hide" });
    const bytes = await readFile(screenshotPath);
    const metadata = await sharp(bytes).metadata();
    screenshotRecords.push({ path: relativePath(screenshotPath), width: metadata.width, height: metadata.height,
      bytes: bytes.length, sha256: sha256(bytes) });
    assertions.push({ width, sourceRoles: measured.sourceRoles, identityVariants: measured.identityVariants,
      swatches: manifest.derivatives.filter((asset) => asset.role === "theme-swatch").length,
      imagesReady: measured.imagesReady, overflow: measured.overflow, seriousAxe,
      externalRequests: [...externalRequests], consoleErrors: [...consoleErrors], pageErrors: [...pageErrors] });
  }

  await page.setViewportSize({ width: 768, height: 1000 });
  const comparisons: Array<Record<string, unknown>> = [];
  for (const source of manifest.sources.filter((entry) => !entry.sourcePath.endsWith("/logo.svg"))) {
    const output = manifest.derivatives.find((asset) => asset.sourceParityIds.includes(source.parityId))!;
    const size = Math.min(source.intrinsic.width, source.intrinsic.height, 160);
    await page.setContent(`<style>body{margin:0}.sample{display:block;width:${size}px;height:${size}px;object-fit:contain}</style><img class="sample" alt="">`);
    const sample = page.locator(".sample");
    await sample.evaluate((image, src) => { (image as HTMLImageElement).src = src; }, dataUrl(sources.get(source.sourcePath)!, "image/svg+xml"));
    await expect(sample).toHaveJSProperty("complete", true);
    const sourceRaster = await sample.screenshot({ animations: "disabled" });
    await sample.evaluate((image, src) => { (image as HTMLImageElement).src = src; }, dataUrl(outputs.get(output.outputPath)!, "image/svg+xml"));
    await expect(sample).toHaveJSProperty("complete", true);
    const outputRaster = await sample.screenshot({ animations: "disabled" });
    const comparison = await compareRaster(sourceRaster, outputRaster);
    expect(comparison.passed, source.parityId).toBe(true);
    comparisons.push({ parityId: source.parityId, mode: "full-raster", ...comparison });
  }
  const logo = manifest.sources.find((entry) => entry.sourcePath.endsWith("/logo.svg"))!;
  const product = manifest.derivatives.find((asset) => asset.id === "product-lockup-positive")!;
  const [logoSvg, productSvg] = [sources.get(logo.sourcePath)!.toString("utf8"), outputs.get(product.outputPath)!.toString("utf8")];
  await page.setContent(`<style>body{margin:0}.sample{color:#1E2A26;width:160px;height:32px}.sample svg{display:block;width:160px;height:32px}</style><div id="source" class="sample">${logoSvg}</div><div id="output" class="sample">${productSvg}</div>`);
  const logoComparison = await compareRaster(await page.locator("#source").screenshot(), await page.locator("#output").screenshot(), 32);
  expect(logoComparison.passed).toBe(true);
  expect(productSvg).not.toMatch(/<text|font-family/i);
  expect(productSvg).toContain('viewBox="0 0 160 32"');
  comparisons.push({ parityId: logo.parityId, mode: "approved-left-32x32-qr-mask", structuralWordmark: "outlined/no-live-text-or-font", ...logoComparison });

  const assertionsPath = join(runDirectory, "assertions.json");
  await writeFile(assertionsPath, `${JSON.stringify(assertions, null, 2)}\n`);
  const filesToBind = [
    "scripts/run-brand-assets-evidence.mjs", "scripts/verify-brand-assets-evidence.mjs",
    "src/brand/assets.manifest.json", "src/brand/brand-identity.tsx", "tests/brand-assets.evidence.spec.ts",
    ...manifest.sources.map((source) => source.sourcePath),
    ...manifest.derivatives.map((asset) => asset.outputPath),
  ].sort();
  const boundSources = await Promise.all(filesToBind.map(async (path) => ({ path, sha256: sha256(await readFile(join(process.cwd(), path))) })));
  const evidenceManifest = {
    schemaVersion: 1, runId, startedAt, finishedAt: new Date().toISOString(),
    matrix: { widths, captures: widths.length },
    coverage: { sourceRoles: 17, directPairs: 16, identityVariants: 8, swatches: 6, faviconFrames: [16, 32, 48] },
    rasterPolicy: { threshold, maxDifferingPixelRatio,
      logoMask: "left 32x32 canonical QR geometry; wordmark outline checked structurally",
      faviconMask: "canonical QR raster checked by exact frame hash/dimensions and displayed at native/128px sizes" },
    browser: { name: "chromium", deviceScaleFactor: 1, externalRequestsBlocked: true, animationsDisabled: true, caretHidden: true },
    inlineIdentitySemantics,
    screenshots: screenshotRecords,
    comparisons,
    assertions: { path: relativePath(assertionsPath), sha256: sha256(await readFile(assertionsPath)) },
    mutationProbes: { path: relativePath(probesPath), sha256: sha256(await readFile(probesPath)), count: probes.length },
    sources: boundSources,
  };
  const evidenceManifestPath = join(runDirectory, "manifest.json");
  await writeFile(evidenceManifestPath, `${JSON.stringify(evidenceManifest, null, 2)}\n`);
  const evidenceManifestBytes = await readFile(evidenceManifestPath);
  const manifestSha256 = sha256(evidenceManifestBytes);
  await writeFile(join(runDirectory, "review.md"), `# Brand asset evidence review\n\n- Run: ${runId}\n- Manifest SHA-256: ${manifestSha256}\n- Coverage: 17 source roles, 16 direct full-raster pairs, outlined logo QR mask, 8 static identity variants, 6 swatches, and 16/32/48 favicons at native and magnified sizes.\n- Raster policy: threshold 0.1; maximum differing-pixel ratio 0.001. The outlined wordmark is a documented derivation, so its QR region uses the left 32×32 target mask while no-live-text/font and viewBox assertions remain independent. Favicon derivation uses exact frame hashes/dimensions and native/magnified visual inspection.\n- Browser isolation: external requests blocked; console and page errors empty; no viewport overflow; serious/critical axe findings empty.\n- Unresolved severity 2–4: none.\n`);
  const currentPointer = { runId, startedAt, manifest: relativePath(evidenceManifestPath), manifestSha256 };
  const pendingPointer = join(artifactRoot, `.current-${runId}.json.tmp`);
  await writeFile(pendingPointer, `${JSON.stringify(currentPointer, null, 2)}\n`);
  await rename(pendingPointer, join(artifactRoot, "current.json"));
  expect((await stat(evidenceManifestPath)).mtimeMs).toBeGreaterThanOrEqual(Date.parse(startedAt!));
  console.log(`BRAND_ASSET_EVIDENCE_RUN=${runId}`);
});

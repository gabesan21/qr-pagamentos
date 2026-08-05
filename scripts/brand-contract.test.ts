import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import {
  parseIcoFrames,
  requiredIdentityIds,
  validateIdentityContract,
  validateManifestContract,
  validateSafeSvg,
} from "./brand-contract.mjs";

const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M0 0h1v1z" fill="currentColor"/></svg>';

describe("fail-closed SVG contract", () => {
  it("accepts the closed static subset", () => {
    expect(validateSafeSvg(safeSvg, { expectedViewBox: "0 0 32 32" })).toMatchObject({ viewBox: "0 0 32 32" });
  });

  it.each([
    ["script", safeSvg.replace("<path", "<script/><path")],
    ["image", safeSvg.replace("<path", '<image href="x"/><path')],
    ["foreignObject", safeSvg.replace("<path", "<foreignObject/><path")],
    ["style", safeSvg.replace("<path", "<style/><path")],
    ["event", safeSvg.replace("<path", '<path onclick="x"')],
    ["network", safeSvg.replace("<path", '<use href="https://example.test/a"/><path')],
    ["data", safeSvg.replace("<path", '<use href="data:image/svg+xml,x"/><path')],
    ["live text", safeSvg.replace("<path", "<text>x</text><path")],
    ["font", safeSvg.replace("<path", '<path font-family="Sora"')],
    ["color", safeSvg.replace("currentColor", "#123456")],
    ["malformed geometry", safeSvg.replace('viewBox="0 0 32 32"', 'viewBox="0 0 0 32"')],
    ["malformed path", safeSvg.replace('d="M0 0h1v1z"', 'd="M"')],
  ])("rejects %s", (_name, svg) => {
    expect(() => validateSafeSvg(svg, { expectedViewBox: "0 0 32 32" })).toThrow();
  });
});

describe("closed manifest and identity contract", () => {
  function identityManifest() {
    const derivatives = [
      ["mark-only", "mark"], ["product-lockup", "product-lockup"],
      ["compact-role-lockup", "compact-role-lockup"], ["merchant-fallback", "merchant-fallback"],
    ].flatMap(([identityId, file]) => ["positive", "reversed"].map((staticVariant) => ({
      id: `${file}-${staticVariant}`, identityId, staticVariant,
    })));
    return { identities: [...requiredIdentityIds], derivatives };
  }

  it("accepts the exact four identity mappings", () => {
    expect(() => validateIdentityContract({ sourceIdentityIds: [...requiredIdentityIds], manifest: identityManifest() })).not.toThrow();
  });

  it("rejects missing, unknown, duplicate, and remapped identities", () => {
    for (const mutate of [
      (manifest: ReturnType<typeof identityManifest>) => manifest.identities.pop(),
      (manifest: ReturnType<typeof identityManifest>) => manifest.identities.push("unknown"),
      (manifest: ReturnType<typeof identityManifest>) => manifest.identities.push("mark-only"),
      (manifest: ReturnType<typeof identityManifest>) => { manifest.derivatives[2].identityId = "merchant-fallback"; },
    ]) {
      const manifest = identityManifest();
      mutate(manifest);
      expect(() => validateIdentityContract({ sourceIdentityIds: manifest.identities, manifest })).toThrow();
    }
  });

  it("accepts the generated full manifest", async () => {
    const manifest = JSON.parse(await readFile("src/brand/assets.manifest.json", "utf8"));
    expect(() => validateManifestContract(manifest)).not.toThrow();
  });

  it("rejects incomplete source, derivative, duplicate, and swatch inventories", async () => {
    const invalid = { version: 2, family: "QR Pagamentos template identity", identities: [...requiredIdentityIds], sources: [], derivatives: [] };
    expect(() => validateManifestContract(invalid)).toThrow(/14 unique/);
    const original = JSON.parse(await readFile("src/brand/assets.manifest.json", "utf8"));
    for (const mutate of [
      (manifest: typeof original) => { delete manifest.sources[0].provenanceReference; },
      (manifest: typeof original) => { manifest.sources[0].sourcePath = "docs/template/app/public/unknown.svg"; },
      (manifest: typeof original) => { manifest.derivatives[0].outputPath = "public/brand/unknown.svg"; },
      (manifest: typeof original) => { manifest.derivatives[1].sha256 = manifest.derivatives[0].sha256; },
      (manifest: typeof original) => { manifest.derivatives[0].sourceParityIds = ["asset:0000000000000000"]; },
      (manifest: typeof original) => { manifest.derivatives.find(({ themeId }: { themeId?: string }) => themeId)!.themeId = "unknown"; },
      (manifest: typeof original) => { manifest.derivatives.find(({ outputPath }: { outputPath: string }) => outputPath.endsWith("favicon.ico"))!.frameSha256[16] = "bad"; },
    ]) {
      const manifest = structuredClone(original);
      mutate(manifest);
      expect(() => validateManifestContract(manifest)).toThrow();
    }
  });
});

describe("ICO parser", () => {
  it("rejects missing sizes, overlapping frames, and incoherent PNG dimensions", () => {
    expect(() => parseIcoFrames(Buffer.alloc(6))).toThrow();
    const header = Buffer.alloc(54);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(3, 4);
    for (let index = 0; index < 3; index += 1) {
      header[6 + index * 16] = [16, 32, 48][index];
      header[7 + index * 16] = [16, 32, 48][index];
      header.writeUInt32LE(24, 14 + index * 16);
      header.writeUInt32LE(54, 18 + index * 16);
    }
    expect(() => parseIcoFrames(Buffer.concat([header, Buffer.alloc(24)]))).toThrow();
  });
});

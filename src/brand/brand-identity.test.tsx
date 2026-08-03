import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BrandIdentity } from "./brand-identity";
import { brandGeometry, brandIdentityIds } from "./geometry";
import {
  soraWordmarkSource,
  templateAssetAuthorization,
  templateAssetSources,
} from "./template-asset-sources";

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("brand identity", () => {
  it("hides a mark that is adjacent to the visible product name", () => {
    const markup = renderToStaticMarkup(<BrandIdentity variant="product-lockup" />);

    expect(markup).toContain('data-brand-identity="product-lockup"');
    expect(markup).toContain("QR Pagamentos");
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain("<title");
    expect(markup).toContain("font-family:var(--font-display)");
    expect(markup).toContain("letter-spacing:var(--tracking-display)");
  });

  it("gives a standalone meaningful mark exactly one accessible name", () => {
    const markup = renderToStaticMarkup(
      <BrandIdentity accessibleName="QR Pagamentos" variant="mark-only" />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="QR Pagamentos"');
    expect(markup).not.toContain("aria-hidden");
    expect(markup).not.toContain("<title");
  });

  it.each(["compact-role-lockup", "merchant-fallback"] as const)(
    "keeps the %s composition explicit",
    (variant) => {
      const markup = renderToStaticMarkup(<BrandIdentity variant={variant} />);

      expect(markup).toContain(`data-brand-identity="${variant}"`);
      expect(markup).toContain("QR Pagamentos");
    },
  );

  it("keeps the approved four-ID API and template QR geometry exact", () => {
    expect(brandIdentityIds).toEqual([
      "mark-only",
      "product-lockup",
      "compact-role-lockup",
      "merchant-fallback",
    ]);
    expect(brandGeometry).toEqual({
      viewBox: "0 0 32 32",
      finderPatterns: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 0, y: 20 }],
      rectangles: [
        { x: 16, y: 4, width: 3, height: 3 },
        { x: 4, y: 16, width: 3, height: 3 },
        { x: 10, y: 16, width: 3, height: 3 },
        { x: 16, y: 16, width: 3, height: 3 },
        { x: 22, y: 16, width: 3, height: 3 },
        { x: 16, y: 22, width: 3, height: 3 },
        { x: 16, y: 28, width: 3, height: 3 },
        { x: 28, y: 22, width: 3, height: 3 },
        { x: 28, y: 28, width: 3, height: 3 },
      ],
    });
  });

  it("binds all supplied sources to factual project authorization without broader claims", () => {
    expect(templateAssetSources).toHaveLength(17);
    expect(new Set(templateAssetSources.map(({ parityId }) => parityId)).size).toBe(17);
    expect(new Set(templateAssetSources.map(({ sourcePath }) => sourcePath)).size).toBe(17);
    expect(templateAssetAuthorization).toEqual({
      recordedAt: "2026-08-02",
      sourceCommit: "813f0cd7",
      originStatement: "Os assets foram todos construídos para nosso projeto",
      projectUseAuthorized: true,
      authorship: "not-asserted",
      exclusivity: "not-asserted",
      license: "not-inferred",
    });

    for (const source of templateAssetSources) {
      const bytes = readFileSync(resolve(process.cwd(), source.sourcePath));
      const svg = bytes.toString("utf8");

      expect(bytes.byteLength, source.sourcePath).toBe(source.bytes);
      expect(sha256(bytes), source.sourcePath).toBe(source.sha256);
      expect(svg, source.sourcePath).toContain(
        `viewBox="0 0 ${source.intrinsic.width} ${source.intrinsic.height}"`,
      );
      expect(svg, source.sourcePath).toContain(`width="${source.intrinsic.width}"`);
      expect(svg, source.sourcePath).toContain(`height="${source.intrinsic.height}"`);
    }
  });

  it("binds the static wordmark to the pinned licensed Sora source", () => {
    const fontBytes = readFileSync(
      resolve(
        process.cwd(),
        "node_modules",
        soraWordmarkSource.packageSource.package,
        soraWordmarkSource.packageSource.file,
      ),
    );
    const licenseBytes = readFileSync(resolve(process.cwd(), soraWordmarkSource.licensePath));
    const outlineBytes = readFileSync(resolve(process.cwd(), soraWordmarkSource.outlinePath));
    const outlines = outlineBytes.toString("utf8");

    expect(sha256(fontBytes)).toBe(soraWordmarkSource.packageSource.sha256);
    expect(sha256(licenseBytes)).toBe(soraWordmarkSource.licenseSha256);
    expect(sha256(outlineBytes)).toBe(soraWordmarkSource.outlineSha256);
    expect(outlines).not.toMatch(/<text\b|font-family|@font-face/i);
    expect(outlines).toContain('viewBox="0 0 120 19"');
  });
});
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

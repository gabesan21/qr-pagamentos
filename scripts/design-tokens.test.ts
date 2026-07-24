import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findDesignTokenViolations } from "./check-design-tokens.mjs";
import { hexFromOklch, resolveExternalRef, resolveToken } from "./design-token-graph.mjs";

const tokenPath = join(process.cwd(), "src/design-system/tokens/themes.tokens.json");
type ColorToken = { $type?: string; $value: { colorSpace: string; components: number[]; hex: string } };
type Theme = { $extensions: Record<string, { mode: string }>; color: Record<string, ColorToken | string> };
type TokenSource = { themes: Record<string, Theme>; $extensions: Record<string, { defaultLight: string; defaultDark: string }> };
const source = JSON.parse(readFileSync(tokenPath, "utf8")) as TokenSource;
const resolver = JSON.parse(readFileSync(join(process.cwd(), "src/design-system/tokens/resolver.json"), "utf8"));
const themeNames = ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"];

function relativeLuminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("six-theme design tokens", () => {
  it("resolves exactly three light and three dark themes with identical semantic paths", () => {
    expect(Object.keys(source.themes)).toEqual(themeNames);
    const paths = Object.values(source.themes).map((theme) => Object.keys(theme.color));
    expect(paths.every((path: string[]) => JSON.stringify(path) === JSON.stringify(paths[0]))).toBe(true);
    const modes = Object.values(source.themes).map((theme) => theme.$extensions["com.qr-pagamentos.theme"].mode);
    expect(modes.filter((mode) => mode === "light")).toHaveLength(3);
    expect(modes.filter((mode) => mode === "dark")).toHaveLength(3);
  });

  it("uses the 2025.10 resolver with deterministic theme and motion contexts", () => {
    expect(resolver.version).toBe("2025.10");
    expect(resolver.modifiers.theme.default).toBe("pix-paper");
    expect(resolver.modifiers.motion.default).toBe("full");
    expect(Object.keys(resolver.modifiers.motion.contexts)).toEqual(["full", "reduced"]);
    for (const modifier of Object.values(resolver.modifiers) as Array<{ contexts: Record<string, Array<{ $ref: string }>> }>)
      for (const refs of Object.values(modifier.contexts)) for (const ref of refs) expect(resolveExternalRef(source, ref.$ref)).toBeTruthy();
    expect(resolveToken(source, "motion.full.duration")).toEqual({ value: 180, unit: "ms" });
    expect(resolveToken(source, "motion.reduced.duration")).toEqual({ value: 0, unit: "ms" });
  });

  it("fails closed for unresolved and cyclic references", () => {
    expect(() => resolveToken({ a: { $value: "{missing}" } }, "a")).toThrow(/Unresolved/);
    expect(() => resolveToken({ a: { $value: "{b}" }, b: { $value: "{a}" } }, "a")).toThrow(/cycle/);
  });

  it.each(themeNames)("keeps %s in gamut and above required contrast", (name) => {
    const color = source.themes[name].color as Record<string, ColorToken>;
    for (const token of Object.values(color).filter((value) => value?.$value)) {
      expect(token.$type ?? source.themes[name].color.$type).toBe("color");
      expect(token.$value.colorSpace).toBe("oklch");
      expect(token.$value.components[0]).toBeGreaterThanOrEqual(0);
      expect(token.$value.components[0]).toBeLessThanOrEqual(1);
      expect(token.$value.components[1]).toBeGreaterThanOrEqual(0);
      expect(token.$value.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(hexFromOklch(token.$value.components)).toBe(token.$value.hex);
    }
    for (const [foreground, background] of [
      ["foreground", "background"], ["primary-foreground", "primary"], ["danger-foreground", "danger"],
      ["warning-foreground", "warning"], ["success-foreground", "success"],
    ]) expect(contrastRatio(hexFromOklch(color[foreground].$value.components), hexFromOklch(color[background].$value.components)), `${name}:${foreground}`).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(hexFromOklch(color.primary.$value.components), hexFromOklch(color.background.$value.components)), `${name}:focus`).toBeGreaterThanOrEqual(3);
  });

  it("generates a current deterministic projection with safe fallback selectors", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain(':root[data-theme="pix-paper"]');
    expect(css).toContain(':root[data-theme="terminal-amber"]');
    expect(css).toContain(":root:not([data-theme]):not(.light)");
    expect(css).toContain("--motion-duration: 180ms");
    expect(css).toContain("--motion-duration: 0ms");
    expect(source.$extensions["com.qr-pagamentos.theme"]).toMatchObject({ defaultLight: "pix-paper", defaultDark: "midnight-clearing" });
  });

  it("allows raw values only in canonical token sources", () => {
    expect(findDesignTokenViolations()).toEqual([]);
    const violations = findDesignTokenViolations([
      { path: join(process.cwd(), "src/components/ui/fixture.tsx"), source: "<main style={{ color: '#112233' }} />" },
      { path: join(process.cwd(), "src/components/ui/fixture.css"), source: ".fixture { padding: 16px; }" },
    ]);
    expect(violations).toContain("src/components/ui/fixture.tsx: raw visual value #112233");
    expect(violations).toContain("src/components/ui/fixture.tsx: inline visual style style=");
    expect(violations).toContain("src/components/ui/fixture.css: raw visual value 16px");
  });

  it("permits only the canonical storefront accent declaration", () => {
    const path = join(process.cwd(), "src/app/store/[slug]/page.tsx");
    const canonical = '<main style={{ "--storefront-accent": storefront.accentColor } as CSSProperties} />';
    expect(findDesignTokenViolations([{ path, source: canonical }])).toEqual([]);
    expect(findDesignTokenViolations([{ path, source: '<main style={{ "--brand": "red" }} />' }])).not.toEqual([]);
  });
});

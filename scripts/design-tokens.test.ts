import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findDesignTokenViolations } from "./check-design-tokens.mjs";
import { buildGeneratedThemeTokens, COMPATIBILITY_ALIASES, loadTokenDocuments } from "./generate-design-tokens.mjs";
import { contrastRatio, hexFromSrgb, resolveDesignTokens, resolveToken } from "./design-token-graph.mjs";

const root = process.cwd();
const resolver = JSON.parse(readFileSync(join(root, "src/design-system/tokens/resolver.json"), "utf8"));
// DTCG fixtures intentionally carry heterogeneous JSON shapes for mutation tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const documents = await loadTokenDocuments(join(root, "src/design-system/tokens")) as Record<string, any>;
const templateCss = readFileSync(join(root, "docs/template/app/src/index.css"), "utf8");
const themeNames = ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"] as const;
type ThemeName = typeof themeNames[number];
const tertiary = {
  "pix-paper": ["#636e68", 92, [4.830, 5.302, 4.538]],
  "cashier-daylight": ["#636f7c", 81, [4.733, 5.128, 4.515]],
  "settlement-sand": ["#706653", 91, [4.886, 5.327, 4.503]],
  "midnight-clearing": ["#808ca0", 54, [5.556, 5.069, 4.518]],
  "vault-blue": ["#7c8cab", 55, [5.524, 5.117, 4.508]],
  "terminal-amber": ["#97835f", 30, [5.288, 4.943, 4.545]],
} as const;

function resolved(theme: ThemeName = "pix-paper", motion = "full") {
  return resolveDesignTokens(resolver, documents, { theme, motion }).tokens;
}

// The JSON resolver deliberately accepts mutation fixtures with heterogeneous DTCG values.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tokenAt(tokens: Record<string, any>, path: string) {
  let token = path.split(".").reduce((node, segment) => node?.[segment], tokens);
  if (token && !("$value" in token) && token.$root) token = token.$root;
  return token;
}

function templateValues(theme: string) {
  const start = templateCss.indexOf(`[data-theme="${theme}"]`);
  const body = templateCss.slice(templateCss.indexOf("{", start) + 1, templateCss.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
}

describe("DTCG 2025.10 application token graph", () => {
  it("uses external primitive, theme, semantic, component and motion sources in deterministic order", () => {
    expect(resolver.version).toBe("2025.10");
    expect(resolver.resolutionOrder.map((entry: { $ref: string }) => entry.$ref)).toEqual([
      "#/sets/primitive", "#/modifiers/theme", "#/sets/semantic", "#/sets/component", "#/modifiers/motion",
    ]);
    expect(Object.keys(documents).sort()).toEqual([
      "components.tokens.json", "motion/full.tokens.json", "motion/reduced.tokens.json", "semantic.tokens.json",
      "themes.tokens.json", ...themeNames.map((name) => `themes/${name}.tokens.json`),
    ].sort());
    expect(Object.keys(resolver.modifiers.theme.contexts)).toEqual(themeNames);
    expect(resolver.modifiers.theme.default).toBe("pix-paper");
    expect(resolver.modifiers.motion.default).toBe("full");
    expect(resolver.$extensions["com.qr-pagamentos.theme"].defaultDark).toBe("midnight-clearing");
    const themeDocuments = themeNames.map((name) => documents[`themes/${name}.tokens.json`]);
    const colorPaths = themeDocuments.map((document) => Object.keys(document.theme.color));
    expect(colorPaths.every((paths) => JSON.stringify(paths) === JSON.stringify(colorPaths[0]))).toBe(true);
    const modes = themeDocuments.map((document) => document.$extensions["com.qr-pagamentos.theme"].mode);
    expect(modes.filter((mode) => mode === "light")).toHaveLength(3);
    expect(modes.filter((mode) => mode === "dark")).toHaveLength(3);
  });

  it("resolves every theme and motion permutation with identical semantic/component paths", () => {
    const signatures = [];
    for (const theme of themeNames) for (const motion of ["full", "reduced"]) {
      const resolution = resolveDesignTokens(resolver, documents, { theme: theme.toUpperCase(), motion: motion.toUpperCase() });
      expect(resolution.contexts).toEqual({ theme, motion });
      signatures.push(JSON.stringify(Object.keys(resolution.tokens.color)) + JSON.stringify(Object.keys(resolution.tokens.component)));
    }
    expect(new Set(signatures)).toHaveLength(1);
    expect(() => resolveDesignTokens(resolver, documents, { theme: "missing" })).toThrow(/Unknown theme context/);
  });

  it("keeps the immutable template source and all 120 audit values exact", () => {
    expect(createHash("sha256").update(templateCss).digest("hex")).toBe("762edf36239e6472ccfc8eb8faa79d73081633dec69ae4fa0fa5a530ccdcead4");
    const audit = documents["themes.tokens.json"].color.primitive.audit.template;
    for (const theme of themeNames) {
      const source = templateValues(theme);
      expect(Object.keys(source)).toHaveLength(20);
      expect(Object.keys(audit[theme])).toEqual(Object.keys(source));
      for (const [name, raw] of Object.entries(source)) {
        const token = audit[theme][name];
        if (String(raw).startsWith("#")) {
          expect(token.$value.colorSpace).toBe("srgb");
          expect(token.$value.hex).toBe(raw);
          expect(hexFromSrgb(token.$value.components)).toBe(raw);
        } else if (String(raw).startsWith("rgba")) {
          expect(token.$value.colorSpace).toBe("srgb");
          expect(raw).toContain(String(token.$value.alpha).replace(/^0/, ""));
        } else expect(token.$type).toBe("shadow");
      }
    }
  });

  it.each(themeNames)("projects %s tertiary text exactly and proves all three fixed ratios", (theme: ThemeName) => {
    const tokens = resolved(theme);
    const expected = tertiary[theme];
    const actual = tokenAt(tokens, "color.text.tertiary").$value.hex;
    expect(actual).toBe(expected[0]);
    expect(documents["themes.tokens.json"].color.primitive.accessibility[theme]["text-tertiary"].$extensions["com.qr-pagamentos.contrast"].interpolationStep).toBe(expected[1]);
    const backgrounds = ["color.surface.page", "color.surface.raised", "color.surface.secondary"];
    backgrounds.forEach((path, index) => {
      const ratio = contrastRatio(actual, tokenAt(tokens, path).$value.hex);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(Number(ratio.toFixed(3))).toBe(expected[2][index]);
    });
  });

  it.each(themeNames)("keeps %s rendered action and feedback pairs at normal-text AA", (theme: ThemeName) => {
    const tokens = resolved(theme);
    expect(contrastRatio(tokenAt(tokens, "color.action.foreground").$value.hex, tokenAt(tokens, "color.action.accent").$value.hex)).toBeGreaterThanOrEqual(4.5);
    for (const name of ["success", "warning", "danger", "info"]) {
      expect(contrastRatio(tokenAt(tokens, `color.feedback.${name}.foreground`).$value.hex, tokenAt(tokens, `color.feedback.${name}.soft`).$value.hex), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("pins geometry, type, elevation, focus and reduced-motion values", () => {
    const full = resolved();
    const reduced = resolved("pix-paper", "reduced");
    expect(["sm", "md", "lg", "pill"].map((name) => tokenAt(full, `radius.semantic.${name}`).$value.value)).toEqual([6, 8, 10, 999]);
    expect(tokenAt(full, "layout.semantic.app").$value).toEqual({ value: 1280, unit: "px" });
    expect(tokenAt(full, "type.semantic.body").$value).toMatchObject({ fontFamily: ["Inter", "system-ui", "sans-serif"], fontSize: { value: 14, unit: "px" }, lineHeight: { value: 20, unit: "px" } });
    expect(tokenAt(full, "type.semantic.page-heading").$value).toMatchObject({ fontFamily: ["Sora", "sans-serif"], letterSpacing: { value: -0.02, unit: "rem" } });
    expect(tokenAt(full, "type.semantic.numeric").$value.fontFamily[0]).toBe("IBM Plex Mono");
    expect(tokenAt(full, "focus.semantic.width").$value).toEqual({ value: 3, unit: "px" });
    expect(tokenAt(full, "color.focus.ring").$value).toMatchObject({ colorSpace: "srgb", hex: "#00b8a0", alpha: 0.35 });
    const durationValue = (token: unknown) => (token as { $value: { value: number } }).$value.value;
    expect(Object.values(full.motion.semantic.duration).map(durationValue)).toEqual([150, 160, 180, 200, 220, 250, 300, 400, 50, 1250, 1400, 1500, 2000]);
    expect(Object.values(reduced.motion.semantic.duration).every((token) => durationValue(token) === 0.01)).toBe(true);
    expect(tokenAt(reduced, "motion.semantic.iteration").$value).toBe(1);
  });

  it("fails closed for missing documents, aliases, cycles, names, types, units, gamut and fallback drift", () => {
    const missingDocument = structuredClone(documents);
    delete missingDocument["semantic.tokens.json"];
    expect(() => resolveDesignTokens(resolver, missingDocument)).toThrow(/Unresolved token document/);
    expect(() => resolveToken({ a: { $type: "color", $value: "{missing}" } }, "a")).toThrow(/Unresolved/);
    const cycle = structuredClone(documents);
    cycle["semantic.tokens.json"].color.surface.page.$value = "{color.surface.raised}";
    cycle["semantic.tokens.json"].color.surface.raised.$value = "{color.surface.page}";
    expect(() => resolveDesignTokens(resolver, cycle)).toThrow(/cycle/);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutations: Array<[string, (copy: any) => void, RegExp]> = [
      ["name", (copy) => { copy["semantic.tokens.json"].color["bad.name"] = { $type: "color", $value: "{theme.color.page}" }; }, /invalid token\/group name/],
      ["type", (copy) => { copy["semantic.tokens.json"].space.semantic[1].$type = "pixels"; }, /invalid token type/],
      ["unit", (copy) => { copy["themes.tokens.json"].space.primitive[1].$value.unit = "vh"; }, /px\/rem/],
      ["gamut", (copy) => { copy["themes.tokens.json"].color.primitive.audit.template["pix-paper"].bg.$value.components[0] = 2; }, /outside sRGB gamut/],
      ["hex", (copy) => { copy["themes.tokens.json"].color.primitive.audit.template["pix-paper"].bg.$value.hex = "#000000"; }, /hex fallback differ/],
    ];
    for (const [, mutate, error] of mutations) {
      const copy = structuredClone(documents); mutate(copy); expect(() => resolveDesignTokens(resolver, copy)).toThrow(error);
    }
  });

  it("generates byte-stable semantic CSS and value-free compatibility aliases", () => {
    const generated = buildGeneratedThemeTokens(documents, resolver);
    for (const theme of themeNames) {
      expect(generated).toContain(`:root[data-theme="${theme}"]`);
      expect(generated).toContain(`[data-theme-preview="${theme}"]`);
    }
    expect(generated).toContain("--color-text-tertiary: #636e68;");
    expect(generated).toContain("--motion-duration: 0.01ms;");
    expect(generated).toContain("animation-iteration-count: var(--motion-iteration) !important;");
    for (const [name, target] of Object.entries(COMPATIBILITY_ALIASES))
      expect(generated).toContain(`--${name}: var(--${target});`);
    const aliases = [...generated.matchAll(/^\s+--(?:background|foreground|card|primary|surface-page|text-primary|action-primary|feedback-success|focus-color):\s*([^;]+);$/gm)].map((match) => match[1]);
    expect(aliases.every((value) => /^var\(--[a-z-]+\)$/.test(value))).toBe(true);
  });

  it("imports exactly the ten approved local Latin weights and no legacy/remote family", () => {
    const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
    const imports = [...css.matchAll(/^@import "(@fontsource\/[^"]+)";$/gm)].map((match) => match[1]);
    expect(imports).toEqual([
      "@fontsource/inter/latin-400.css", "@fontsource/inter/latin-500.css", "@fontsource/inter/latin-600.css",
      "@fontsource/sora/latin-400.css", "@fontsource/sora/latin-500.css", "@fontsource/sora/latin-600.css", "@fontsource/sora/latin-700.css",
      "@fontsource/ibm-plex-mono/latin-400.css", "@fontsource/ibm-plex-mono/latin-500.css", "@fontsource/ibm-plex-mono/latin-600.css",
    ]);
    expect(css).not.toMatch(/IBM Plex Sans|fonts\.googleapis|fonts\.gstatic/);
  });

  it("keeps raw visual values inside the canonical generated/token boundary", () => {
    expect(findDesignTokenViolations()).toEqual([]);
    const fixture = [{ path: join(root, "src/components/ui/fixture.tsx"), source: "<main style={{ color: '#112233' }} />" }];
    expect(findDesignTokenViolations(fixture)).toEqual([
      "src/components/ui/fixture.tsx: raw visual value #112233", "src/components/ui/fixture.tsx: inline visual style style=",
    ]);
  });
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findDesignTokenViolations } from "./check-design-tokens.mjs";
import { buildGeneratedThemeTokens, COMPATIBILITY_ALIASES, loadTokenDocuments, projectGeneratedThemeTokens } from "./generate-design-tokens.mjs";
import { compositeSrgb, contrastRatio, deriveAccessibleProjection, hexFromSrgb, highestContrastForeground, resolveDesignTokens, resolveToken } from "./design-token-graph.mjs";

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
const feedbackProjection = {
  "pix-paper": { success: ["#1e7b4b", 76, "#ffffff"], warning: ["#8d6321", 70, "#ffffff"], danger: ["#c13b3a", 7, "#ffffff"], info: ["#2b6cb0", 0, "#ffffff"] },
  "cashier-daylight": { success: ["#157e3d", 4, "#ffffff"], warning: ["#9c6008", 9, "#ffffff"], danger: ["#b91c1c", 0, "#ffffff"], info: ["#0369a1", 0, "#ffffff"] },
  "settlement-sand": { success: ["#497210", 28, "#ffffff"], warning: ["#92400e", 0, "#ffffff"], danger: ["#a63535", 0, "#ffffff"], info: ["#315c8c", 0, "#ffffff"] },
  "midnight-clearing": { success: ["#34d399", 0, "#000000"], warning: ["#fbbf24", 0, "#000000"], danger: ["#f87171", 0, "#000000"], info: ["#60a5fa", 0, "#000000"] },
  "vault-blue": { success: ["#3ecf8e", 0, "#000000"], warning: ["#f5b93f", 0, "#000000"], danger: ["#ef6a6a", 0, "#000000"], info: ["#7aa8ff", 0, "#000000"] },
  "terminal-amber": { success: ["#8fcb5c", 0, "#000000"], warning: ["#ffd166", 0, "#000000"], danger: ["#ff7a5c", 0, "#000000"], info: ["#e8b04b", 0, "#000000"] },
} as const;
const focusProjection = {
  "pix-paper": ["#069a87", 53, [3.199, 3.512, 3.006]],
  "cashier-daylight": ["#2456e6", 0, [5.462, 5.918, 5.210]],
  "settlement-sand": ["#a85b1e", 0, [4.342, 4.734, 4.001]],
  "midnight-clearing": ["#5eead4", 0, [12.770, 11.650, 10.383]],
  "vault-blue": ["#4f8dfd", 0, [5.849, 5.417, 4.773]],
  "terminal-amber": ["#ffb224", 0, [10.752, 10.051, 9.241]],
} as const;
const actionInteractions = {
  "pix-paper": { foreground: "#1e2a26", default: "#00b8a0", hover: "#24c3ab", active: "#38cfb6", direction: "lighter" },
  "cashier-daylight": { foreground: "#ffffff", default: "#2456e6", hover: "#1a48d8", active: "#103aca", direction: "darker" },
  "settlement-sand": { foreground: "#ffffff", default: "#a85b1e", hover: "#9d510f", active: "#904700", direction: "darker" },
  "midnight-clearing": { foreground: "#08251f", default: "#5eead4", hover: "#6df7e1", active: "#9effed", direction: "lighter" },
  "vault-blue": { foreground: "#0b1220", default: "#4f8dfd", hover: "#649bff", active: "#79a9ff", direction: "lighter" },
  "terminal-amber": { foreground: "#241700", default: "#ffb224", hover: "#ffc46d", active: "#ffd69b", direction: "lighter" },
} as const;

function oklchFromHex(hex: string) {
  const [red, green, blue] = hex.match(/[0-9a-f]{2}/giu)!.map((channel) => Number.parseInt(channel, 16) / 255).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { lightness, chroma: Math.hypot(a, b), hue: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}

function hueDistance(left: number, right: number) {
  return Math.abs(((left - right + 540) % 360) - 180);
}

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

  it.each(themeNames)("keeps %s rendered action and every strong/soft feedback role at normal-text AA", (theme: ThemeName) => {
    const tokens = resolved(theme);
    expect(contrastRatio(tokenAt(tokens, "color.action.foreground").$value.hex, tokenAt(tokens, "color.action.accent").$value.hex)).toBeGreaterThanOrEqual(4.5);
    const surfaces = ["page", "raised", "secondary"].map((name) => tokenAt(tokens, `color.surface.${name}`).$value.hex);
    const primary = tokenAt(tokens, "color.text.primary").$value.hex;
    const audit = documents["themes.tokens.json"].color.primitive.audit.template[theme];
    const accessibility = documents["themes.tokens.json"].color.primitive.accessibility[theme];
    for (const name of ["success", "warning", "danger", "info"] as const) {
      const strong = tokenAt(tokens, `color.feedback.${name}`).$value.hex;
      const foreground = tokenAt(tokens, `color.feedback.${name}.foreground`).$value.hex;
      const soft = tokenAt(tokens, `color.feedback.${name}.soft`).$value.hex;
      const softForeground = tokenAt(tokens, `color.feedback.${name}.soft-foreground`).$value.hex;
      const foregroundCompositeOpacities = name === "danger" ? [0.9] : [];
      const derived = deriveAccessibleProjection(audit[name].$value.hex, primary, surfaces, { foregroundCompositeOpacities });
      expect([strong, derived.step, foreground]).toEqual(feedbackProjection[theme][name]);
      expect(accessibility[`feedback-${name}`].$extensions["com.qr-pagamentos.contrast"].interpolationStep).toBe(derived.step);
      expect(derived.hex).toBe(strong);
      expect(derived.ratios.every((ratio) => ratio >= 4.5), `${name} against surfaces`).toBe(true);
      expect(derived.foreground).toEqual({ hex: foreground, ratio: contrastRatio(foreground, strong) });
      expect(highestContrastForeground(strong)).toEqual(derived.foreground);
      expect(derived.foregroundRatios.every((ratio) => ratio >= 4.5), `${name} foreground in solid/hover backgrounds`).toBe(true);
      expect(contrastRatio(foreground, strong), `${name} foreground`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(softForeground, soft), `${name} soft foreground`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(themeNames)("pins every %s soft-foreground primitive (success/warning/danger/info/accent) to its derived AA projection", (theme: ThemeName) => {
    const audit = documents["themes.tokens.json"].color.primitive.audit.template[theme];
    const accessibility = documents["themes.tokens.json"].color.primitive.accessibility[theme];
    const primary = audit.text.$value.hex;
    const roles = { success: "success", warning: "warning", danger: "danger", info: "info", accent: "accent" } as const;
    for (const [role, auditName] of Object.entries(roles)) {
      const origin = audit[auditName].$value.hex;
      const softSurface = audit[`${auditName}-soft`].$value.hex;
      const primitive = accessibility[`${role}-soft-foreground`];
      const derived = deriveAccessibleProjection(origin, primary, [softSurface], { minimumRatio: 4.5 });
      expect(primitive.$value.hex, role).toBe(derived.hex);
      expect(primitive.$extensions["com.qr-pagamentos.contrast"].interpolationStep, role).toBe(derived.step);
      expect(contrastRatio(primitive.$value.hex, softSurface), role).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(themeNames)("projects %s focus to an opaque three-pixel indicator with 3:1 contrast", (theme: ThemeName) => {
    const tokens = resolved(theme);
    const audit = documents["themes.tokens.json"].color.primitive.audit.template[theme];
    const expected = focusProjection[theme];
    const backgrounds = ["page", "raised", "secondary"].map((name) => tokenAt(tokens, `color.surface.${name}`).$value.hex);
    const ring = tokenAt(tokens, "color.focus.ring").$value;
    const derived = deriveAccessibleProjection(audit["ring-color"].$value.hex, audit.text.$value.hex, backgrounds, { minimumRatio: 3 });

    expect([ring.hex, derived.step]).toEqual(expected.slice(0, 2));
    expect(ring.alpha).toBeUndefined();
    expect(documents["themes.tokens.json"].color.primitive.accessibility[theme]["focus-ring"].$extensions["com.qr-pagamentos.contrast"].interpolationStep).toBe(derived.step);
    backgrounds.forEach((background, index) => {
      const ratio = contrastRatio(ring.hex, background);
      expect(ratio).toBeGreaterThanOrEqual(3);
      expect(Number(ratio.toFixed(3))).toBe(expected[2][index]);
    });

    const auditRing = audit["ring-color"].$value;
    const auditCompositedRatios = backgrounds.map((background) => contrastRatio(
      compositeSrgb(auditRing.hex, background, auditRing.alpha), background,
    ));
    expect(auditCompositedRatios.some((ratio) => ratio < 3)).toBe(true);
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
    expect(tokenAt(full, "color.focus.ring").$value).toMatchObject({ colorSpace: "srgb", hex: "#069a87" });
    expect(tokenAt(full, "color.focus.ring").$value.alpha).toBeUndefined();
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
    expect(COMPATIBILITY_ALIASES).toMatchObject({
      primary: "color-button-primary-background", "primary-hover": "color-button-primary-hover-background", "primary-active": "color-button-primary-active-background",
      destructive: "color-feedback-danger", "destructive-foreground": "color-feedback-danger-foreground",
      warning: "color-feedback-warning", "warning-foreground": "color-feedback-warning-foreground",
      success: "color-feedback-success", "success-foreground": "color-feedback-success-foreground",
    });
    const aliases = [...generated.matchAll(/^\s+--(?:background|foreground|card|primary|surface-page|text-primary|action-primary|feedback-success|focus-color):\s*([^;]+);$/gm)].map((match) => match[1]);
    expect(aliases.every((value) => /^var\(--[a-z-]+\)$/.test(value))).toBe(true);
  });

  it("derives gamut-safe, contrast-safe action states from every immutable audit accent", () => {
    for (const theme of themeNames) {
      const tokens = resolved(theme);
      const expected = actionInteractions[theme];
      const auditAccent = tokenAt(tokens, `color.primitive.audit.template.${theme}.accent`).$value.hex;
      const roles = ["default", "hover", "active"] as const;
      const colors = Object.fromEntries(roles.map((role) => [role, tokenAt(tokens, `color.action.${role}`).$value.hex])) as Record<typeof roles[number], string>;

      expect(auditAccent).toBe(expected.default);
      expect(colors).toEqual({ default: expected.default, hover: expected.hover, active: expected.active });
      expect(tokenAt(tokens, "component.button.primary.background").$value.hex).toBe(colors.default);
      expect(tokenAt(tokens, "component.button.primary.hover-background").$value.hex).toBe(colors.hover);
      expect(tokenAt(tokens, "component.button.primary.active-background").$value.hex).toBe(colors.active);
      expect(tokenAt(tokens, "component.button.primary.foreground").$value.hex).toBe(expected.foreground);
      expect(roles.map((role) => contrastRatio(expected.foreground, colors[role])).every((ratio) => ratio >= 4.5)).toBe(true);

      const progression = roles.map((role) => oklchFromHex(colors[role]));
      expect(progression.every(({ chroma, hue }) => Number.isFinite(chroma) && Number.isFinite(hue))).toBe(true);
      expect(hueDistance(progression[0].hue, progression[1].hue)).toBeLessThan(2);
      expect(hueDistance(progression[1].hue, progression[2].hue)).toBeLessThan(2);
      expect(progression[1].chroma).toBeLessThanOrEqual(progression[0].chroma + 0.001);
      expect(progression[2].chroma).toBeLessThanOrEqual(progression[1].chroma + 0.001);
      if (expected.direction === "lighter") {
        expect(progression[0].lightness).toBeLessThan(progression[1].lightness);
        expect(progression[1].lightness).toBeLessThan(progression[2].lightness);
      } else {
        expect(progression[0].lightness).toBeGreaterThan(progression[1].lightness);
        expect(progression[1].lightness).toBeGreaterThan(progression[2].lightness);
      }

      for (const state of ["hover", "active"] as const) {
        const primitive = documents["themes.tokens.json"].color.primitive.accessibility[theme][`action-${state}`];
        expect(primitive.$extensions["com.qr-pagamentos.action-progression"]).toMatchObject({
          space: "oklch", from: `color.primitive.audit.template.${theme}.accent`, direction: expected.direction, state,
        });
      }
    }
  });

  it("projects action state variables exactly from the component graph", () => {
    const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
    expect(css).toBe(projectGeneratedThemeTokens(css, documents, resolver));
    const generated = buildGeneratedThemeTokens(documents, resolver);
    for (const theme of themeNames) {
      const expected = actionInteractions[theme];
      expect(generated).toContain(`--color-button-primary-background: ${expected.default};`);
      expect(generated).toContain(`--color-button-primary-hover-background: ${expected.hover};`);
      expect(generated).toContain(`--color-button-primary-active-background: ${expected.active};`);
      expect(generated).toContain(`--primary-hover: var(--color-button-primary-hover-background);`);
      expect(generated).toContain(`--primary-active: var(--color-button-primary-active-background);`);
    }
    expect(css).toContain("--color-primary-hover: var(--primary-hover);");
    expect(css).toContain("--color-primary-active: var(--primary-active);");
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

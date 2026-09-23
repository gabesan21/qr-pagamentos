import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Node-side parsing of the generated stylesheet — no CSS engine needed, only the
// text contract this task owns: the `@theme inline` template-utility vocabulary
// projects onto generated variables (never a literal), and every named theme
// carries the four soft feedback tints the domain badge families depend on.
const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

function block(source: string, openMarker: string): string {
  const start = source.indexOf(openMarker);
  expect(start, `expected to find "${openMarker}"`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  let index = source.indexOf("{", start);
  const bodyStart = index + 1;
  do {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") depth -= 1;
    index += 1;
  } while (depth > 0);
  return source.slice(bodyStart, index - 1);
}

describe("globals.css @theme inline template utilities", () => {
  const themeBlock = block(css, "@theme inline {");
  // The `@theme inline` block mixes the shadcn compatibility entries (kept
  // for the vendored ui/ primitives) with the template's own utility
  // vocabulary (docs/template/app/tailwind.config.js). Isolate the
  // vocabulary sub-block by its start anchor so the "exactly N" count below
  // never silently drifts by counting the shadcn entries too.
  const vocabularyStart = themeBlock.indexOf("--color-bg:");
  expect(vocabularyStart, "expected the template utility vocabulary section").toBeGreaterThanOrEqual(0);
  const vocabularyBlock = themeBlock.slice(vocabularyStart);
  const declaredNames = [...vocabularyBlock.matchAll(/^\s*(--[\w-]+):/gmu)].map((match) => match[1]);

  const utilityNames = [
    "--color-bg",
    "--color-surface",
    "--color-surface-2",
    "--color-text",
    "--color-text-2",
    "--color-text-3",
    "--color-accent-fg",
    "--color-accent-soft",
    "--color-danger",
    "--color-info",
    "--color-success-soft",
    "--color-warning-soft",
    "--color-danger-soft",
    "--color-info-soft",
    "--color-success-on-soft",
    "--color-warning-on-soft",
    "--color-danger-on-soft",
    "--color-info-on-soft",
    "--color-accent-on-soft",
    "--radius-card",
    "--radius-pill",
    "--shadow-card",
    "--font-display",
    "--font-money",
    "--container-app",
    "--container-checkout",
    "--container-auth-form",
  ];

  it("declares exactly the 27 template utility entries, each resolving to a generated variable", () => {
    expect(declaredNames).toHaveLength(27);
    expect(new Set(declaredNames)).toStrictEqual(new Set(utilityNames));
    for (const name of utilityNames) {
      const match = vocabularyBlock.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}:\\s*([^;]+);`, "u"));
      expect(match, name).not.toBeNull();
      const value = match![1].trim();
      expect(value, name).toMatch(/^var\(--[\w-]+\)$/u);
    }
  });

  it("never lets a template utility resolve to a literal color or length", () => {
    for (const name of utilityNames) {
      const match = vocabularyBlock.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}:\\s*([^;]+);`, "u"));
      const value = match![1].trim();
      expect(value, name).not.toMatch(/#[\da-f]{3,8}\b/iu);
      expect(value, name).not.toMatch(/^\d/u);
    }
  });
});

describe("globals.css theme soft feedback projections", () => {
  const themeNames = ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"] as const;
  const softVariables = [
    "--color-feedback-success-soft",
    "--color-feedback-warning-soft",
    "--color-feedback-danger-soft",
    "--color-feedback-info-soft",
  ];

  it.each(themeNames)("carries all four soft feedback tints in the %s authenticated theme", (theme) => {
    const themeBody = block(css, `:root[data-theme="${theme}"] {`);
    for (const variable of softVariables) expect(themeBody, variable).toContain(`${variable}:`);
  });

  it.each(themeNames)("carries all four soft feedback tints in the %s storefront preview", (theme) => {
    const previewBody = block(css, `[data-theme-preview="${theme}"] {`);
    for (const variable of softVariables) expect(previewBody, variable).toContain(`${variable}:`);
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `14.7.2` pins the single-system contract `14.7.1` delivered (see
// `DESIGN.md` › "BEM retirement (14.7.1)"): the route-scoped BEM CSS system
// is gone, only the four sanctioned exceptions remain, and the app-shell
// sheet stays the sole route-neutral survivor. This is a fixture, not a
// visual test — it fails the moment a retired class name resurfaces or a
// second BEM sheet appears, without waiting for a Playwright capture.

const repoRoot = process.cwd();

// Retired route-scoped class name prefixes/leaves — 81 rule-lines deleted by
// `14.7.1` F03 against a zero-referrer grep (`globals.css`).
const retiredNames = [
  "admin-shell",
  "admin-account",
  "admin-product",
  "receipt-rail",
  "ds-ledger",
  "ds-section",
  "ds-row",
  "ds-facts",
  "data-ds-prose",
  "nautt-facts",
  "settings-surface__",
  "auth-page",
  "auth-card__tagline",
  "auth-card__caption",
  "auth-card__strip",
  "auth-card__swatch",
  "auth-card__form--tight",
  "auth-card__footer",
  "auth-card__panel-brand",
  "auth-password-field",
  "auth-forgot",
  "auth-totp-actions",
  "auth-mode-toggle",
  "login-page",
  "reset-password-page",
];

const thisFile = new URL(import.meta.url).pathname;

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) return [];
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolute);
    if (absolute === thisFile) return [];
    if (/\.(tsx?|css)$/u.test(entry.name)) return [absolute];
    return [];
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

describe("single CSS system (14.7.1 BEM retirement, pinned by 14.7.2)", () => {
  const srcRoot = join(repoRoot, "src");
  const sourceFiles = collectSourceFiles(srcRoot);

  it("emits no retired route-scoped BEM class name anywhere in src/**", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const text = readFileSync(file, "utf8");
      for (const name of retiredNames) {
        // Word-boundary match not preceded by `data-`: the survivor
        // `data-ds-*` custom attributes and `data-directory-*` ids are a
        // different, still-alive vocabulary and must never false-positive.
        const pattern = new RegExp(String.raw`(?<!data-)(?<![\w-])${escapeRegExp(name)}(?![\w-])`, "u");
        if (pattern.test(text)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the four (min-width: 900px) auth split-card selectors alive in globals.css", () => {
    const css = readFileSync(join(srcRoot, "app/globals.css"), "utf8");
    const breakpointIndex = css.indexOf("(min-width: 900px)");
    expect(breakpointIndex, "expected the sanctioned 900px auth breakpoint block").toBeGreaterThanOrEqual(0);
    const block = css.slice(breakpointIndex, css.indexOf("}", css.indexOf("{", breakpointIndex) + 1) + 400);
    for (const selector of [".auth-card {", ".auth-card__panel {", ".auth-card__form {", ".auth-card__language {"]) {
      expect(css.includes(selector), `expected ${selector} to survive outside the media block`).toBe(true);
    }
    expect(block).toMatch(/\.auth-card\s*\{/u);
    expect(block).toMatch(/\.auth-card__panel\s*\{/u);
  });

  it("keeps src/app-shell/app-shell.css as the only remaining route-neutral BEM stylesheet", () => {
    // `globals.css` keeps a BEM block too (the sanctioned `.auth-card*` 900px
    // exception, asserted above) — it is not itself a dedicated BEM sheet.
    // The pin is that no *third* stylesheet grows a `.block__element` family
    // beside the two named, sanctioned files.
    const sanctioned = new Set(["src/app-shell/app-shell.css", "src/app/globals.css"]);
    const cssFiles = sourceFiles.filter((file) => file.endsWith(".css"));
    const unsanctionedBemSheets = cssFiles
      .filter((file) => !sanctioned.has(file.slice(repoRoot.length + 1)))
      .filter((file) => /\.[a-z][a-z-]*__[a-z]/u.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(repoRoot.length + 1));
    expect(unsanctionedBemSheets).toEqual([]);

    const appShellCss = readFileSync(join(srcRoot, "app-shell/app-shell.css"), "utf8");
    expect(appShellCss).toMatch(/\.[a-z][a-z-]*__[a-z]/u);
  });
});

// Guard the fixture itself: fail loudly if the repo layout it walks moves.
describe("fixture sanity", () => {
  it("resolves src/ as a real directory", () => {
    expect(statSync(join(repoRoot, "src")).isDirectory()).toBe(true);
  });
});

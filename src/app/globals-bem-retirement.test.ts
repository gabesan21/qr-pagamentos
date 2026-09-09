import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `14.7.2` pins the single-system contract `14.7.1` delivered (see
// `DESIGN.md` › "BEM retirement (14.7.1)"): the route-scoped BEM CSS system
// is gone, only the four sanctioned exceptions remain, and the app-shell
// sheet stays the sole route-neutral survivor. This is a fixture, not a
// visual test — it fails the moment a retired class *family* resurfaces
// (including a `__element`/`--modifier` leaf under it) or a second BEM
// sheet appears, without waiting for a Playwright capture.

const repoRoot = process.cwd();

// Retired route-scoped class-name FAMILIES (81 rule-lines deleted by
// `14.7.1` F03 against a zero-referrer grep — see
// `pop/memory/2026-09-08/14.7.1-retire-bem-and-refresh-contracts.03-css-deletion.md`).
// A family matches its bare block name AND any `-continuation`,
// `__element` or `--modifier` leaf under it (e.g. `admin` also retires
// `admin-shell`, `admin-shell__sidebar`, `admin-account--empty`…).
const retiredFamilies = [
  "admin",
  "receipt-rail",
  "ds",
  "nautt-facts",
  "settings-surface",
  "auth-page",
  "auth-password-field",
  "auth-forgot",
  "auth-totp-actions",
  "auth-mode-toggle",
  "login",
  "reset-password",
];

// Specific retired leaves under the still-alive `auth-card` block — the
// block name itself and its four sanctioned leaves (`auth-card__panel`,
// `auth-card__form`, `auth-card__language`) survive; only these do not.
const retiredLeaves = [
  "auth-card__tagline",
  "auth-card__caption",
  "auth-card__strip",
  "auth-card__swatch",
  "auth-card__form--tight",
  "auth-card__footer",
  "auth-card__panel-brand",
];

// The one retired attribute selector (`[data-ds-prose]`) — not a class
// token, checked separately in CSS text.
const retiredAttributeSelector = "data-ds-prose";

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

// A token is "retired" when it equals a family/leaf exactly, or extends it
// with a `-` continuation, a `__element` or a `--modifier` — the shape a
// real BEM name under that family takes.
function isRetiredToken(token: string, name: string): boolean {
  if (token === name) return true;
  return token.startsWith(`${name}-`) || token.startsWith(`${name}__`) || token.startsWith(`${name}--`);
}

function matchedRetiredName(token: string): string | undefined {
  for (const leaf of retiredLeaves) {
    if (isRetiredToken(token, leaf)) return leaf;
  }
  for (const family of retiredFamilies) {
    if (isRetiredToken(token, family)) return family;
  }
  return undefined;
}

// Extracts every candidate class-name token from `className="…"`,
// `className={"…"}`, `className={`…`}` and `className={cn(...)}` sites —
// scoped to className content so an unrelated word like a dictionary key
// (`dictionary.adminNotProvided`) or an i18n import (`admin-dashboard/en`)
// never false-positives.
function extractClassNameTokens(text: string): string[] {
  const tokens: string[] = [];
  const attrRegex = /className\s*=\s*(\{|"|')/gu;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(text))) {
    const start = match.index + match[0].length;
    const delimiter = match[1];
    if (delimiter === "{") {
      let depth = 1;
      let i = start;
      while (i < text.length && depth > 0) {
        if (text[i] === "{") depth += 1;
        else if (text[i] === "}") depth -= 1;
        i += 1;
      }
      const raw = text.slice(start, i - 1);
      const literals = raw.match(/["'`]([^"'`]*)["'`]/gu) ?? [];
      for (const literal of literals) {
        const inner = literal.slice(1, -1);
        tokens.push(...inner.split(/\s+/u).filter(Boolean));
      }
    } else {
      const end = text.indexOf(delimiter, start);
      const raw = text.slice(start, end === -1 ? text.length : end);
      tokens.push(...raw.split(/\s+/u).filter(Boolean));
    }
  }
  return tokens;
}

// Extracts every dot-prefixed CSS selector token (`.block__element`) from a
// stylesheet — anchored on the leading `.` so plain text/comments never
// false-positive.
function extractCssSelectorTokens(text: string): string[] {
  const matches = text.match(/\.[a-zA-Z][\w-]*/gu) ?? [];
  return matches.map((match) => match.slice(1));
}

function findMediaBlock(css: string, mediaQuery: string): string {
  const queryIndex = css.indexOf(mediaQuery);
  expect(queryIndex, `expected to find "${mediaQuery}" in globals.css`).toBeGreaterThanOrEqual(0);
  const openBrace = css.indexOf("{", queryIndex);
  let depth = 1;
  let i = openBrace + 1;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") depth -= 1;
    i += 1;
  }
  return css.slice(openBrace + 1, i - 1);
}

describe("single CSS system (14.7.1 BEM retirement, pinned by 14.7.2)", () => {
  const srcRoot = join(repoRoot, "src");
  const sourceFiles = collectSourceFiles(srcRoot);

  it("emits no retired route-scoped BEM class family anywhere in src/** className/CSS-selector positions", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const text = readFileSync(file, "utf8");
      const tokens = file.endsWith(".css") ? extractCssSelectorTokens(text) : extractClassNameTokens(text);
      for (const token of tokens) {
        const matched = matchedRetiredName(token);
        if (matched) offenders.push(`${file.slice(repoRoot.length + 1)}: "${token}" (family: ${matched})`);
      }
      if (file.endsWith(".css") && new RegExp(String.raw`\[${retiredAttributeSelector}\]`, "u").test(text)) {
        offenders.push(`${file.slice(repoRoot.length + 1)}: [${retiredAttributeSelector}]`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the four (min-width: 900px) auth split-card selectors declared INSIDE the media block, and auth-card.tsx still emits their elements", () => {
    const css = readFileSync(join(srcRoot, "app/globals.css"), "utf8");
    const block = findMediaBlock(css, "@media (min-width: 900px)");
    for (const selector of [".auth-card {", ".auth-card__panel {", ".auth-card__form {", ".auth-card__language {"]) {
      expect(block.includes(selector), `expected ${selector} inside the 900px media block`).toBe(true);
    }

    const authCardSource = readFileSync(join(srcRoot, "app/auth-card.tsx"), "utf8");
    const emittedTokens = new Set(extractClassNameTokens(authCardSource));
    for (const className of ["auth-card", "auth-card__panel", "auth-card__form", "auth-card__language"]) {
      expect(emittedTokens.has(className), `expected auth-card.tsx to emit className "${className}"`).toBe(true);
    }
  });

  it("keeps src/app-shell/app-shell.css as the only other stylesheet carrying BEM selectors", () => {
    const cssFiles = sourceFiles.filter((file) => file.endsWith(".css"));
    const sanctioned = new Set(["src/app-shell/app-shell.css", "src/app/globals.css"]);
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

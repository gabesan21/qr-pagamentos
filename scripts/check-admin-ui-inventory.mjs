import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const entrypoints = ["src/app/(merchant)", "src/app/admin", "src/app-shell", "src/app/language-preference"];
const rawControls = new Set(["button", "input", "select", "textarea"]);
// 15.4.1 gate repair: mirrors the path+pattern accent-style authorization already
// granted by scripts/check-design-tokens.mjs's `allowedAccentStyles` — narrowed to
// the one path this inventory scans (src/app/admin/accounts/[id]/page.tsx); never
// widened beyond that existing authorization.
const allowedAccentStyles = [
  { path: "src/app/admin/accounts/[id]/page.tsx", pattern: /^style=\{\{ "--storefront-accent": editor\.storefrontAccentColor \?\? "transparent" \} as CSSProperties\}$/ },
];

async function loadShellSelectors(root) {
  try {
    const source = await readFile(path.join(root, "src/app-shell/app-shell.css"), "utf8");
    const selectors = new Set();
    for (const match of source.matchAll(/\.([A-Za-z][\w-]*)/g)) selectors.add(match[1]);
    return selectors;
  } catch {
    return new Set();
  }
}

// 13.3.2 gate precision: shell BEM chrome is sanctioned only for files under
// src/app-shell/** and only when src/app-shell/app-shell.css defines a matching
// selector — rule-backed, not a prefix or literal allowance, so a shell class
// whose rule is deleted still fails (src/app-shell/AGENTS.md, DESIGN.md "BEM
// retirement (14.7.1)").
function isSanctionedShellClass(token, file, shellSelectors) {
  return file.startsWith("src/app-shell/") && shellSelectors.has(token);
}

// 13.3.2 gate precision: a `--` occurrence is the sanctioned token channel only
// when it appears inside a var(--…) reference — mirrors the authorization
// scripts/check-design-tokens.mjs already grants (:7, :32-38) and the
// max-w-[var(--layout-max)] exception preserved by the 15.4.1 closed map. A
// `--modifier` outside a var(…) reference stays a hard failure.
function isSanctionedTokenReference(token) {
  const withoutVarRefs = token.replace(/var\(--[\w-]+\)/g, "");
  return !/--[a-z]/i.test(withoutVarRefs);
}

function isSanctionedToken(token, file, shellSelectors) {
  if (/__[a-z]/i.test(token) && !isSanctionedShellClass(token, file, shellSelectors)) return false;
  if (/--[a-z]/i.test(token) && !isSanctionedTokenReference(token)) return false;
  return true;
}

async function collect(root, candidate) {
  const absolute = path.join(root, candidate);
  const metadata = await stat(absolute);
  if (metadata.isFile()) return candidate.endsWith(".tsx") && !candidate.endsWith(".test.tsx") ? [candidate] : [];
  const entries = await readdir(absolute);
  const nested = await Promise.all(entries.map((entry) => collect(root, path.join(candidate, entry))));
  return nested.flat();
}

export async function checkAdminUiInventory(candidateRoot) {
  const root = path.resolve(candidateRoot);
  const files = (await Promise.all(entrypoints.map((entrypoint) => collect(root, entrypoint)))).flat().sort();
  const shellSelectors = await loadShellSelectors(root);
  const failures = [];
  const counters = { raw_controls: 0, adapter_imports: 0, inline_styles: 0, local_variants: 0 };

  function fail(category, file, node, source, detail) {
    counters[category] += 1;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    failures.push(`${file}:${position.line + 1}:${position.character + 1} ${category} ${detail}`);
  }

  for (const file of files) {
    const sourceText = await readFile(path.join(root, file), "utf8");
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text.startsWith("@/app/ui") || node.moduleSpecifier.text.includes("/app/ui/")) fail("adapter_imports", file, node, source, node.moduleSpecifier.text);
      if (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.some((element) => element.name.text === "cva")) fail("local_variants", file, node, source, "cva import");
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (rawControls.has(tag)) {
        // 15.4.1 gate repair: a literal `type="hidden"` or `sr-only` bridge
        // input is non-presentational (DESIGN.md 14.4.3 hidden-input bridge,
        // 14.5.2 radio-card group) and the frozen `owners` set has no
        // primitive to compose for it — narrow to <input> only.
        const isBridgeInput = tag === "input" && node.attributes.properties.some((attribute) => {
          if (!ts.isJsxAttribute(attribute) || !attribute.initializer || !ts.isStringLiteral(attribute.initializer)) return false;
          const attributeName = attribute.name.getText(source);
          if (attributeName === "type") return attribute.initializer.text === "hidden";
          if (attributeName === "className") return attribute.initializer.text.split(/\s+/).includes("sr-only");
          return false;
        });
        if (!isBridgeInput) fail("raw_controls", file, node, source, `<${tag}>`);
      }
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        if (attribute.name.getText(source) === "style") {
          const styleText = attribute.getText(source);
          const isAllowedAccentStyle = allowedAccentStyles.some((candidate) => candidate.path === file && candidate.pattern.test(styleText));
          if (!isAllowedAccentStyle) fail("inline_styles", file, attribute, source, "style attribute");
        }
        if (attribute.name.getText(source) === "className") {
          const value = attribute.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : null;
          if (value) {
            const tokens = value.split(/\s+/).filter(Boolean);
            if (tokens.some((token) => !isSanctionedToken(token, file, shellSelectors))) {
              fail("local_variants", file, attribute, source, `className=${value}`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
    }
    visit(source);
  }

  if (failures.length > 0) throw new Error(`Admin UI inventory failed:\n${failures.join("\n")}`);
  return { counters, files };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { counters, files } = await checkAdminUiInventory(process.env.ADMIN_UI_CHECK_ROOT ?? process.cwd());
  for (const file of files) console.log(`ADMIN_UI_FILE ${file}`);
  console.log(`ADMIN_UI_SOURCE_OK raw_controls=${counters.raw_controls} adapter_imports=${counters.adapter_imports} inline_styles=${counters.inline_styles} local_variants=${counters.local_variants}`);
}

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const entrypoints = ["src/app/(merchant)", "src/app/admin", "src/app-shell", "src/app/language-preference"];
const rawControls = new Set(["button", "input", "select", "textarea"]);
const allowedClasses = new Set([
  "admin-account", "admin-account-list", "admin-account__actions", "admin-account__facts",
  "admin-catalog-item", "admin-catalog-item__facts", "admin-catalog-list",
  "admin-confirm-actions", "admin-navigation", "admin-shell", "admin-shell__intro", "admin-skeletons",
  "admin-product", "admin-product-description", "admin-product-list", "admin-product__facts",
  "h-11 w-full", "receipt-rail", "receipt-rail__facts", "receipt-rail__label",
  "app-shell", "app-shell__content", "app-shell__desktop-navigation", "app-shell__empty-marker",
  "app-shell__identity", "app-shell__mobile-header", "app-shell__mobile-navigation",
  "app-shell__mobile-panel", "app-shell__mobile-trigger", "app-shell__navigation-index",
  "app-shell__mobile-sign-out",
  "app-shell__mobile-trigger-label",
  "app-shell__navigation-link", "app-shell__navigation-list", "app-shell__principal",
  "app-shell__sidebar", "app-shell__sign-out", "app-shell__skip-link", "app-shell__username",
  "workspace-heading", "workspace-heading__eyebrow",
]);

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
      if (rawControls.has(tag)) fail("raw_controls", file, node, source, `<${tag}>`);
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute)) continue;
        if (attribute.name.getText(source) === "style") fail("inline_styles", file, attribute, source, "style attribute");
        if (attribute.name.getText(source) === "className") {
          const value = attribute.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : null;
          if (!value || !allowedClasses.has(value)) fail("local_variants", file, attribute, source, `className=${value ?? "dynamic"}`);
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

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const uiRoots = [join(root, "src", "app"), join(root, "src", "app-shell"), join(root, "src", "components", "ui"), join(root, "src", "data-directory")];
const visualValue = /#[\da-f]{3,8}\b|\b\d*\.?\d+(?:px|rem|em|ch)\b|\brgb\(|\bfont-family\s*:(?!\s*var\()|\bfont-weight\s*:(?!\s*var\()|\bline-height\s*:(?!\s*var\()/i;
const inlineStyle = /\bstyle\s*=/i;
const allowedAccentStyles = [
  { path: "src/app/store/[slug]/page.tsx", pattern: /style=\{\{ "--storefront-accent": storefront\.accentColor \} as CSSProperties\}/g },
  { path: "src/app/store/[slug]/pay/page.tsx", pattern: /style=\{\{ "--storefront-accent": storefront\.accentColor \} as CSSProperties\}/g },
  { path: "src/app/storefront-preview.tsx", pattern: /style=\{\{ "--storefront-accent": accentColor \} as CSSProperties\}/g },
  { path: "src/app/pay/[identifier]/checkout-shell.tsx", pattern: /style=\{branding \? \(\{ "--storefront-accent": branding\.accentColor \} as CSSProperties\) : undefined\}/g },
  { path: "src/app/admin/accounts/[id]/page.tsx", pattern: /style=\{\{ "--storefront-accent": editor\.storefrontAccentColor \?\? "transparent" \} as CSSProperties\}/g },
];
// CSS custom properties cannot participate in media-query conditions. This is
// the one directory-local responsive breakpoint, kept exact so it cannot turn
// into a general raw-value escape hatch.
const allowedStructuralBreakpoints = [
  { path: "src/data-directory/ui/data-directory-client.tsx", pattern: /min-\[360px\]/g },
];

// Shared controls must consume the generated `--control-*` contract. The
// owner list protects the primitive boundary; the JSX scan protects every
// caller, including DataDirectory, from adding a local density override.
const sharedControlOwners = new Set([
  "src/components/ui/button.tsx",
  "src/components/ui/input.tsx",
  "src/components/ui/native-select.tsx",
  "src/components/ui/textarea.tsx",
]);
const controlTags = new Set(["Button", "Input", "NativeSelect", "Textarea"]);
const nativeControlTags = new Set(["button", "input", "select", "textarea"]);
const sharedControlModule = /(?:^|\/)components\/ui\/(button|input|native-select|textarea)$/u;

function controlImports(sourceFile) {
  const aliases = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const moduleMatch = statement.moduleSpecifier.text.match(sharedControlModule);
    if (!moduleMatch) continue;
    const canonical = moduleMatch[1].split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join("");
    const clause = statement.importClause;
    if (clause?.name) aliases.set(clause.name.text, canonical);
    for (const element of clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : []) {
      const imported = element.propertyName?.text ?? element.name.text;
      if (imported === canonical) aliases.set(element.name.text, canonical);
    }
  }
  return aliases;
}

function jsxAttribute(element, name) {
  return element.properties.find((property) => ts.isJsxAttribute(property) && property.name.text === name);
}

function expressionClassNames(expression) {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text.split(/\s+/).filter(Boolean);
  if (ts.isTemplateExpression(expression)) {
    return [expression.head.text, ...expression.templateSpans.flatMap((span) => [
      ...expressionClassNames(span.expression),
      span.literal.text,
    ])].flatMap((value) => value.split(/\s+/)).filter(Boolean);
  }
  if (ts.isCallExpression(expression)) return expression.arguments.flatMap(expressionClassNames);
  if (ts.isConditionalExpression(expression)) return [...expressionClassNames(expression.whenTrue), ...expressionClassNames(expression.whenFalse)];
  if (ts.isBinaryExpression(expression)) return [...expressionClassNames(expression.left), ...expressionClassNames(expression.right)];
  if (ts.isArrayLiteralExpression(expression)) return expression.elements.flatMap((element) => ts.isExpression(element) ? expressionClassNames(element) : []);
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isTypeAssertionExpression(expression)) return expressionClassNames(expression.expression);
  return [];
}

function classNames(attribute) {
  if (!attribute?.initializer) return [];
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text.split(/\s+/).filter(Boolean);
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) return expressionClassNames(attribute.initializer.expression);
  return [];
}

function utilityBase(utility) {
  let squareDepth = 0;
  let parenDepth = 0;
  let start = 0;
  for (let index = 0; index < utility.length; index += 1) {
    const character = utility[index];
    if (character === "[") squareDepth += 1;
    else if (character === "]") squareDepth = Math.max(0, squareDepth - 1);
    else if (character === "(") parenDepth += 1;
    else if (character === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (character === ":" && squareDepth === 0 && parenDepth === 0) start = index + 1;
  }
  return utility.slice(start);
}

function isAdHocControlUtility(utility) {
  const base = utilityBase(utility);
  if (/^(?:(?:min-)?h|size|p(?:[trblsexy])?|rounded)-(?!\(--control-)[^\s]+$/u.test(base)) return true;
  return /^text-(?:xs|sm|base|lg|xl|2xl|3xl)$/u.test(base);
}

function attributeStringValue(attribute) {
  return attribute && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined;
}

function isStructuralNativeControlException(attributes) {
  const type = attributeStringValue(jsxAttribute(attributes, "type"));
  const role = attributeStringValue(jsxAttribute(attributes, "role"));
  return ["hidden", "color", "radio"].includes(type) || role === "radio" || classNames(jsxAttribute(attributes, "className")).some((name) => utilityBase(name) === "sr-only");
}

export function findControlClassViolations(relativePath, source) {
  const violations = [];
  const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const aliases = controlImports(sourceFile);
  const visit = (node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
      const tagName = ts.isIdentifier(node.tagName) ? node.tagName.text : undefined;
      const sharedControl = tagName && (aliases.get(tagName) ?? (controlTags.has(tagName) ? tagName : undefined));
      const nativeControl = tagName && nativeControlTags.has(tagName) && !isStructuralNativeControlException(node.attributes);
      if (sharedControl || nativeControl) {
        for (const utility of classNames(jsxAttribute(node.attributes, "className"))) {
          if (!isAdHocControlUtility(utility)) continue;
          const violation = `${relativePath}: ad hoc ${sharedControl ?? tagName} utility ${utilityBase(utility)}`;
          if (!violations.includes(violation)) violations.push(violation);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

function authoredUiFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return authoredUiFiles(path);
    if (!/\.(css|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) return [];
    return [path];
  });
}

function removeTokenSource(path, source) {
  const withoutGeneratedTokens = path.endsWith("globals.css")
    ? source.replace(/\/\* generated-theme-tokens:start \*\/[\s\S]*?\/\* generated-theme-tokens:end \*\//, "")
    : source;
  let inspectedSource = withoutGeneratedTokens;
  if (path.endsWith("globals.css")) {
    inspectedSource = inspectedSource
      .replaceAll("(min-width: 900px)", "(min-width: var(--breakpoint-auth))")
      .replaceAll("(min-width: 64rem)", "(min-width: var(--breakpoint-lg))");
  }
  if (path.endsWith("app-shell.css")) {
    inspectedSource = inspectedSource
      .replaceAll("(max-width: 63.9375rem)", "(max-width: var(--shell-mobile-breakpoint))")
      .replaceAll("(max-width: 39.9375rem)", "(max-width: var(--shell-compact-breakpoint))");
  }
  const relativePath = relative(root, path);
  const structural = allowedStructuralBreakpoints.find((candidate) => candidate.path === relativePath);
  return structural ? inspectedSource.replace(structural.pattern, "min-[var(--directory-compact-breakpoint)]") : inspectedSource;
}

export function findDesignTokenViolations(files = uiRoots.flatMap(authoredUiFiles).map((path) => ({ path, source: readFileSync(path, "utf8") }))) {
  return files.flatMap(({ path, source }) => {
    const violations = [];
    const inspectedSource = removeTokenSource(path, source);
    const visualMatch = inspectedSource.match(visualValue);
    if (visualMatch) violations.push(`${relative(root, path)}: raw visual value ${visualMatch[0]}`);
    const relativePath = relative(root, path);
    if (sharedControlOwners.has(relativePath) && !source.includes("--control-")) {
      violations.push(`${relativePath}: shared-control owner does not consume the generated control contract`);
    }
    violations.push(...findControlClassViolations(relativePath, source));
    const allowed = allowedAccentStyles.find((candidate) => candidate.path === relativePath);
    const allowedMatches = allowed ? inspectedSource.match(allowed.pattern) : null;
    const sourceWithoutAllowedStyle = allowedMatches?.length === 1
      ? inspectedSource.replace(allowed.pattern, "")
      : inspectedSource;
    const inlineStyleMatch = sourceWithoutAllowedStyle.match(inlineStyle);
    if (inlineStyleMatch) violations.push(`${relative(root, path)}: inline visual style ${inlineStyleMatch[0]}`);
    return violations;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = findDesignTokenViolations();
  if (violations.length > 0) {
    console.error(violations.join("\n"));
    process.exitCode = 1;
  }
}

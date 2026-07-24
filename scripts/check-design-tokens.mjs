import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const uiRoots = [join(root, "src", "app"), join(root, "src", "components", "ui")];
const visualValue = /#[\da-f]{3,8}\b|\b\d*\.?\d+(?:px|rem|em|ch)\b|\brgb\(|\bfont-family\s*:(?!\s*var\()|\bfont-weight\s*:(?!\s*var\()|\bline-height\s*:(?!\s*var\()/i;
const inlineStyle = /\bstyle\s*=/i;
const storefrontPagePath = "src/app/store/[slug]/page.tsx";
const storefrontAccentStyle = /style=\{\{ "--storefront-accent": storefront\.accentColor \} as CSSProperties\}/g;

function authoredUiFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return authoredUiFiles(path);
    if (!/\.(css|tsx)$/.test(entry.name) || /\.test\./.test(entry.name)) return [];
    return [path];
  });
}

function removeTokenSource(path, source) {
  if (!path.endsWith("globals.css")) return source;
  return source
    .replace(/\/\* design-tokens:start \*\/[\s\S]*?\/\* design-tokens:end \*\//, "")
    .replace(/\/\* generated-theme-tokens:start \*\/[\s\S]*?\/\* generated-theme-tokens:end \*\//, "");
}

export function findDesignTokenViolations(files = uiRoots.flatMap(authoredUiFiles).map((path) => ({ path, source: readFileSync(path, "utf8") }))) {
  return files.flatMap(({ path, source }) => {
    const violations = [];
    const inspectedSource = removeTokenSource(path, source);
    const visualMatch = inspectedSource.match(visualValue);
    if (visualMatch) violations.push(`${relative(root, path)}: raw visual value ${visualMatch[0]}`);
    const relativePath = relative(root, path);
    const allowedStorefrontStyles = relativePath === storefrontPagePath ? inspectedSource.match(storefrontAccentStyle) : null;
    const sourceWithoutAllowedStyle = allowedStorefrontStyles?.length === 1
      ? inspectedSource.replace(storefrontAccentStyle, "")
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

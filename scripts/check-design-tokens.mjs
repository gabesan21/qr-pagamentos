import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const uiRoot = join(root, "src", "app");
const visualValue = /#[\da-f]{3,8}\b|\b\d*\.?\d+(?:px|rem|em|ch)\b|\brgb\(|\bfont-family\s*:(?!\s*var\()|\bfont-weight\s*:(?!\s*var\()/i;
const inlineStyle = /\bstyle\s*=/i;

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
  return source.replace(/\/\* design-tokens:start \*\/[\s\S]*?\/\* design-tokens:end \*\//, "");
}

export function findDesignTokenViolations(files = authoredUiFiles(uiRoot).map((path) => ({ path, source: readFileSync(path, "utf8") }))) {
  return files.flatMap(({ path, source }) => {
    const violations = [];
    const inspectedSource = removeTokenSource(path, source);
    const visualMatch = inspectedSource.match(visualValue);
    if (visualMatch) violations.push(`${relative(root, path)}: raw visual value ${visualMatch[0]}`);
    const inlineStyleMatch = inspectedSource.match(inlineStyle);
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

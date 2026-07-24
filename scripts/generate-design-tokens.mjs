import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { hexFromOklch, resolveDesignTokens } from "./design-token-graph.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tokenPath = join(root, "src/design-system/tokens/themes.tokens.json");
const resolverPath = join(root, "src/design-system/tokens/resolver.json");
const cssPath = join(root, "src/app/globals.css");

function format(value, token) {
  if (typeof value === "number")
    return `${value}${token.$extensions?.["com.qr-pagamentos.css"]?.unit ?? ""}`;
  if (Array.isArray(value))
    return token.$type === "fontFamily"
      ? value.map((item) => item.includes(" ") ? `"${item}"` : item).join(", ")
      : `cubic-bezier(${value.join(", ")})`;
  if (value && "unit" in value) return `${value.value}${value.unit}`;
  throw new Error(`Unsupported reference token type: ${token.$type}`);
}

function flattenReferences(group, prefix = []) {
  return Object.entries(group).flatMap(([name, node]) => {
    if (name.startsWith("$")) return [];
    if ("$value" in node) {
      const token = { ...node, $type: node.$type ?? group.$type };
      return [[`reference-${[...prefix, name].join("-")}`, format(node.$value, token)]];
    }
    return flattenReferences(node, [...prefix, name]);
  });
}

function colorVariables(tokens, projection) {
  return Object.entries(projection).flatMap(([cssName, tokenName]) => {
    const value = tokens.color[tokenName].$value;
    const derived = hexFromOklch(value.components);
    if (derived.toLowerCase() !== value.hex.toLowerCase())
      throw new Error(`Fallback mismatch for ${cssName}: ${value.hex} != ${derived}`);
    return [`  --${cssName}: ${derived};`, `  --${cssName}: oklch(${value.components.join(" ")});`];
  }).join("\n");
}

function motionVariables(tokens) {
  return [
    `  --motion-duration: ${format(tokens.duration.$value, tokens.duration)};`,
    `  --motion-ease: ${format(tokens.easing.$value, tokens.easing)};`,
  ].join("\n");
}

export function buildGeneratedThemeTokens(source, resolver) {
  const projection = resolver.$extensions?.["com.qr-pagamentos.css"]?.color;
  if (!projection) throw new Error("Resolver CSS color projection extension is missing.");

  const defaultResolution = resolveDesignTokens(resolver, source);
  const defaultTokens = defaultResolution.tokens;
  const defaultTheme = defaultResolution.contexts.theme;
  const defaultDark = source.$extensions["com.qr-pagamentos.theme"].defaultDark;
  const darkTokens = resolveDesignTokens(resolver, source, { theme: defaultDark }).tokens;
  const reducedTokens = resolveDesignTokens(resolver, source, { motion: "reduced" }).tokens;
  const references = flattenReferences(defaultTokens.reference)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join("\n");

  const themeNames = Object.keys(resolver.modifiers.theme.contexts);
  const blocks = [
    `:root {\n${references}\n  color-scheme: light dark;\n${colorVariables(defaultTokens, projection)}\n${motionVariables(defaultTokens)}\n}`,
    `:root.dark {\n  color-scheme: dark;\n${colorVariables(darkTokens, projection)}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]):not(.light) {\n    color-scheme: dark;\n${colorVariables(darkTokens, projection).split("\n").map((line) => `  ${line}`).join("\n")}\n  }\n}`,
    ...themeNames.map((name) => {
      const tokens = resolveDesignTokens(resolver, source, { theme: name }).tokens;
      const mode = tokens.$extensions["com.qr-pagamentos.theme"].mode;
      return `:root[data-theme="${name}"] {\n  color-scheme: ${mode};\n${colorVariables(tokens, projection)}\n}`;
    }),
    `@media (prefers-reduced-motion: reduce) {\n  :root { ${motionVariables(reducedTokens).trim().replace("\n", " ")} }\n}`,
  ];

  if (defaultTheme !== resolver.modifiers.theme.default)
    throw new Error(`Resolver default theme mismatch: ${defaultTheme}`);
  return blocks.join("\n\n");
}

export function projectGeneratedThemeTokens(css, source, resolver) {
  const start = "/* generated-theme-tokens:start */";
  const end = "/* generated-theme-tokens:end */";
  const projection = `${start}\n${buildGeneratedThemeTokens(source, resolver)}\n${end}`;
  const startIndex = css.indexOf(start);
  const endIndex = css.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) throw new Error("Generated theme marker is missing.");
  return `${css.slice(0, startIndex)}${projection}${css.slice(endIndex + end.length)}`;
}

async function main() {
  const [source, resolver, css] = await Promise.all([
    readFile(tokenPath, "utf8").then(JSON.parse),
    readFile(resolverPath, "utf8").then(JSON.parse),
    readFile(cssPath, "utf8"),
  ]);
  const next = projectGeneratedThemeTokens(css, source, resolver);
  if (process.argv.includes("--check")) {
    if (next !== css) throw new Error("globals.css token projection is stale; run pnpm tokens:generate.");
  } else {
    await writeFile(cssPath, next);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

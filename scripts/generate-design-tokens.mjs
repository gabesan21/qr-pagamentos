import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { hexFromOklch, resolveExternalRef, resolveToken } from "./design-token-graph.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tokenPath = join(root, "src/design-system/tokens/themes.tokens.json");
const resolverPath = join(root, "src/design-system/tokens/resolver.json");
const cssPath = join(root, "src/app/globals.css");
const [source, resolver, css] = await Promise.all([tokenPath, resolverPath, cssPath].map(async (path) => JSON.parse?.name && path.endsWith(".json") ? JSON.parse(await readFile(path, "utf8")) : readFile(path, "utf8")));
if (resolver.version !== "2025.10") throw new Error("Resolver version must be 2025.10.");
for (const entry of resolver.resolutionOrder) {
  const target = entry.$ref.split("/").at(-1);
  if (!resolver.sets[target] && !resolver.modifiers[target]) throw new Error(`Unresolved resolution-order reference: ${entry.$ref}`);
}
for (const modifier of Object.values(resolver.modifiers)) {
  if (!modifier.contexts[modifier.default]) throw new Error(`Missing default modifier context: ${modifier.default}`);
  for (const refs of Object.values(modifier.contexts)) for (const ref of refs) resolveExternalRef(source, ref.$ref);
}

function format(value, token) {
  if (typeof value === "number") return `${value}${token.$extensions?.["com.qr-pagamentos.css"]?.unit ?? ""}`;
  if (Array.isArray(value)) return token.$type === "fontFamily" ? value.map((item) => item.includes(" ") ? `"${item}"` : item).join(", ") : `cubic-bezier(${value.join(", ")})`;
  if ("unit" in value) return `${value.value}${value.unit}`;
  throw new Error(`Unsupported reference token type: ${token.$type}`);
}
function flatten(group, prefix = []) {
  return Object.entries(group).flatMap(([name, node]) => {
    if (name.startsWith("$")) return [];
    if ("$value" in node) return [[`reference-${[...prefix, name].join("-")}`, format(resolveToken(source, ["reference", ...prefix, name].join(".")), { ...node, $type: node.$type ?? group.$type })]];
    return flatten(node, [...prefix, name]);
  });
}
const references = flatten(source.reference).map(([name, value]) => `  --${name}: ${value};`).join("\n");
const colorProjection = resolver.projection.color;
function colors(theme) {
  return Object.entries(colorProjection).flatMap(([cssName, tokenName]) => {
    const value = theme.color[tokenName].$value;
    const derived = hexFromOklch(value.components);
    if (derived.toLowerCase() !== value.hex.toLowerCase()) throw new Error(`Fallback mismatch for ${cssName}: ${value.hex} != ${derived}`);
    return [`  --${cssName}: ${derived};`, `  --${cssName}: oklch(${value.components.join(" ")});`];
  }).join("\n");
}
const motion = (context) => {
  const value = source.motion[context];
  return [`  --motion-duration: ${format(resolveToken(source, `motion.${context}.duration`), value.duration)};`, `  --motion-ease: ${format(resolveToken(source, `motion.${context}.easing`), value.easing)};`].join("\n");
};
const themes = Object.entries(source.themes);
const dark = source.themes["midnight-clearing"];
const blocks = [
  `:root {\n${references}\n  color-scheme: light dark;\n${colors(source.themes["pix-paper"])}\n${motion("full")}\n}`,
  `:root.dark {\n  color-scheme: dark;\n${colors(dark)}\n}`,
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]):not(.light) {\n    color-scheme: dark;\n${colors(dark).split("\n").map((line) => `  ${line}`).join("\n")}\n  }\n}`,
  ...themes.map(([name, theme]) => `:root[data-theme="${name}"] {\n  color-scheme: ${theme.$extensions["com.qr-pagamentos.theme"].mode};\n${colors(theme)}\n}`),
  `@media (prefers-reduced-motion: reduce) {\n  :root { ${motion("reduced").trim().replace("\n", " ")} }\n}`
];
const start = "/* generated-theme-tokens:start */", end = "/* generated-theme-tokens:end */";
const projection = `${start}\n${blocks.join("\n\n")}\n${end}`;
const startIndex = css.indexOf(start), endIndex = css.indexOf(end);
if (startIndex < 0 || endIndex < startIndex) throw new Error("Generated theme marker is missing.");
const next = `${css.slice(0, startIndex)}${projection}${css.slice(endIndex + end.length)}`;
if (process.argv.includes("--check")) {
  if (next !== css) throw new Error("globals.css token projection is stale; run pnpm tokens:generate.");
} else await writeFile(cssPath, next);

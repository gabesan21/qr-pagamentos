import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourcePath = join(root, "src/design-system/tokens/themes.tokens.json");
const cssPath = join(root, "src/app/globals.css");
const start = "/* generated-theme-tokens:start */";
const end = "/* generated-theme-tokens:end */";
const source = JSON.parse(await readFile(sourcePath, "utf8"));

const semantic = {
  background: "background",
  foreground: "foreground",
  card: "card",
  "card-foreground": "foreground",
  popover: "card",
  "popover-foreground": "foreground",
  primary: "primary",
  "primary-foreground": "primary-foreground",
  secondary: "muted",
  "secondary-foreground": "foreground",
  muted: "muted",
  "muted-foreground": "muted-foreground",
  accent: "muted",
  "accent-foreground": "foreground",
  destructive: "danger",
  "destructive-foreground": "danger-foreground",
  warning: "warning",
  "warning-foreground": "warning-foreground",
  success: "success",
  "success-foreground": "success-foreground",
  border: "border",
  input: "border",
  ring: "primary",
  "action-primary-hover": "primary-hover"
};

function declarations(theme) {
  return Object.entries(semantic).flatMap(([cssName, tokenName]) => {
    const value = theme.color[tokenName].$value;
    const [lightness, chroma, hue] = value.components;
    return [`  --${cssName}: ${value.hex};`, `  --${cssName}: oklch(${lightness} ${chroma} ${hue});`];
  }).join("\n");
}

const themes = Object.entries(source.themes);
const dark = themes.find(([name]) => name === "midnight-clearing")[1];
const blocks = [
  `:root {\n  color-scheme: light dark;\n${declarations(source.themes["pix-paper"])}\n}`,
  `:root.dark {\n  color-scheme: dark;\n${declarations(dark)}\n}`,
  `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme]):not(.light) {\n    color-scheme: dark;\n${declarations(dark).split("\n").map((line) => `  ${line}`).join("\n")}\n  }\n}`,
  ...themes.map(([name, theme]) => `:root[data-theme="${name}"] {\n  color-scheme: ${theme.$extensions["com.qr-pagamentos.theme"].mode};\n${declarations(theme)}\n}`)
];
const projection = `${start}\n${blocks.join("\n\n")}\n${end}`;
const css = await readFile(cssPath, "utf8");
const startIndex = css.indexOf(start);
const endIndex = css.indexOf(end);
if (startIndex < 0 || endIndex < startIndex) throw new Error("Generated theme marker is missing.");
const next = `${css.slice(0, startIndex)}${projection}${css.slice(endIndex + end.length)}`;
if (process.argv.includes("--check")) {
  if (next !== css) throw new Error("globals.css theme projection is stale; run pnpm tokens:generate.");
} else {
  await writeFile(cssPath, next);
}

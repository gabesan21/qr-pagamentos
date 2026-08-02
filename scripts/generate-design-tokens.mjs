import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import { resolveDesignTokens } from "./design-token-graph.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tokenDir = join(root, "src/design-system/tokens");
const resolverPath = join(tokenDir, "resolver.json");
const cssPath = join(root, "src/app/globals.css");

async function tokenFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return tokenFiles(path);
    return entry.name.endsWith(".tokens.json") ? [path] : [];
  }))).flat();
}

export async function loadTokenDocuments(directory = tokenDir) {
  const documents = {};
  for (const path of (await tokenFiles(directory)).sort()) {
    const key = relative(directory, path).split(sep).join("/");
    documents[key] = JSON.parse(await readFile(path, "utf8"));
  }
  return documents;
}

function tokenAt(tokens, path) {
  let token = tokens;
  let inheritedType;
  for (const segment of path.split(".")) {
    inheritedType = token?.$type ?? inheritedType;
    token = token?.[segment];
  }
  inheritedType = token?.$type ?? inheritedType;
  if (token && !("$value" in token) && token.$root) token = token.$root;
  if (!token || !("$value" in token)) throw new Error(`Missing projected token: ${path}`);
  return { ...token, $type: token.$type ?? inheritedType };
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
}

function formatColor(value) {
  if (value.alpha === undefined || value.alpha === 1) return value.hex;
  const channels = value.components.map((component) => Math.round(component * 255));
  return `rgba(${channels.join(", ")}, ${formatNumber(value.alpha)})`;
}

function formatShadow(value) {
  const shadows = Array.isArray(value) ? value : [value];
  return shadows.map((shadow) => [
    shadow.inset ? "inset " : "",
    `${formatDimension(shadow.offsetX)} ${formatDimension(shadow.offsetY)} ${formatDimension(shadow.blur)} ${formatDimension(shadow.spread)} `,
    formatColor(shadow.color),
  ].join("")).join(", ");
}

function formatDimension(value, token) {
  const override = token?.$extensions?.["com.qr-pagamentos.css"]?.unitOverride;
  return `${formatNumber(value.value)}${override ?? value.unit}`;
}

function formatToken(token) {
  const value = token.$value;
  switch (token.$type) {
    case "color": return formatColor(value);
    case "dimension": return formatDimension(value, token);
    case "duration": return formatDimension(value);
    case "fontFamily": return value.map((family) => family.includes(" ") ? `"${family}"` : family).join(", ");
    case "fontWeight":
    case "number": return `${formatNumber(value)}${token.$extensions?.["com.qr-pagamentos.css"]?.unit ?? ""}`;
    case "cubicBezier": return `cubic-bezier(${value.map(formatNumber).join(", ")})`;
    case "shadow": return formatShadow(value);
    default: throw new Error(`Unsupported CSS token type: ${token.$type}`);
  }
}

const COMMON_PROJECTION = {
  "space-1": "space.semantic.1", "space-2": "space.semantic.2", "space-3": "space.semantic.3",
  "space-4": "space.semantic.4", "space-5": "space.semantic.5", "space-6": "space.semantic.6",
  "space-8": "space.semantic.8", "space-10": "space.semantic.10", "space-12": "space.semantic.12",
  "radius-tight": "radius.semantic.sm", "radius-control": "radius.semantic.md", "radius-panel": "radius.semantic.lg", "radius-pill": "radius.semantic.pill",
  "focus-width": "focus.semantic.width", "focus-offset": "focus.semantic.offset",
  "target-min-size": "size.semantic.target-min", "control-min-height": "size.semantic.target-min", "control-compact-height": "size.semantic.control-compact",
  "auth-action-height": "size.semantic.auth-action", "table-row-height": "size.semantic.table-row", "top-bar-height": "size.semantic.top-bar",
  "rail-width": "size.semantic.rail", "auth-panel-width": "size.semantic.auth-panel",
  "breakpoint-grid": "breakpoint.semantic.grid", "breakpoint-auth": "breakpoint.semantic.auth", "breakpoint-lg": "breakpoint.semantic.lg",
  "shell-max": "layout.semantic.app", "checkout-max": "layout.semantic.checkout", "auth-form-max": "layout.semantic.auth-form", "auth-card-max": "layout.semantic.auth-card", "layout-max": "layout.semantic.prose",
  "font-interface": "font.semantic.body", "font-display": "font.semantic.display", "font-numeric": "font.semantic.numeric",
  "type-body": "type.primitive.size.body", "type-small": "type.primitive.size.caption", "type-title": "type.primitive.size.section-heading", "type-display": "type.primitive.size.page-heading",
  "line-height-body": "type.primitive.line.body", "line-height-tight": "type.primitive.line.page-heading", "tracking-display": "type.primitive.tracking.display",
  "font-weight-medium": "font.primitive.weight.500", "font-weight-strong": "font.primitive.weight.600",
  "shadow-modal": "shadow.elevation.modal", "disabled-opacity": "opacity.semantic.disabled", "layer-chrome": "layer.semantic.chrome", "layer-bypass": "layer.semantic.bypass",
};

const THEME_PROJECTION = {
  "color-surface-page": "color.surface.page", "color-surface-raised": "color.surface.raised", "color-surface-secondary": "color.surface.secondary",
  "color-border-default": "color.border.default", "color-text-primary": "color.text.primary", "color-text-secondary": "color.text.secondary", "color-text-tertiary": "color.text.tertiary",
  "color-action-accent": "color.action.accent", "color-action-foreground": "color.action.foreground", "color-action-soft": "color.action.soft",
  "color-feedback-success": "color.feedback.success", "color-feedback-success-soft": "color.feedback.success.soft", "color-feedback-success-foreground": "color.feedback.success.foreground",
  "color-feedback-warning": "color.feedback.warning", "color-feedback-warning-soft": "color.feedback.warning.soft", "color-feedback-warning-foreground": "color.feedback.warning.foreground",
  "color-feedback-danger": "color.feedback.danger", "color-feedback-danger-soft": "color.feedback.danger.soft", "color-feedback-danger-foreground": "color.feedback.danger.foreground",
  "color-feedback-info": "color.feedback.info", "color-feedback-info-soft": "color.feedback.info.soft", "color-feedback-info-foreground": "color.feedback.info.foreground",
  "color-focus-ring": "color.focus.ring", "shadow-elevation-card": "shadow.elevation.card",
};

export const COMPATIBILITY_ALIASES = {
  background: "color-surface-page", foreground: "color-text-primary", card: "color-surface-raised", "card-foreground": "color-text-primary",
  popover: "color-surface-raised", "popover-foreground": "color-text-primary", primary: "color-action-accent", "primary-foreground": "color-action-foreground",
  secondary: "color-surface-secondary", "secondary-foreground": "color-text-primary", muted: "color-surface-secondary", "muted-foreground": "color-text-secondary",
  accent: "color-action-soft", "accent-foreground": "color-text-primary", destructive: "color-feedback-danger-soft", "destructive-foreground": "color-feedback-danger-foreground",
  warning: "color-feedback-warning-soft", "warning-foreground": "color-feedback-warning-foreground", success: "color-feedback-success-soft", "success-foreground": "color-feedback-success-foreground",
  border: "color-border-default", input: "color-border-default", ring: "color-focus-ring", "action-primary-hover": "color-action-accent",
  "surface-page": "color-surface-page", "surface-raised": "color-surface-raised", "surface-subtle": "color-surface-secondary",
  "text-primary": "color-text-primary", "text-secondary": "color-text-secondary", "text-tertiary": "color-text-tertiary", "text-on-action": "color-action-foreground",
  "border-subtle": "color-border-default", "action-primary": "color-action-accent", "action-secondary": "color-action-soft",
  "feedback-success": "color-feedback-success", "feedback-warning": "color-feedback-warning", "feedback-danger": "color-feedback-danger", "feedback-info": "color-feedback-info",
  "text-on-success": "color-feedback-success-foreground", "text-on-warning": "color-feedback-warning-foreground", "text-on-danger": "color-feedback-danger-foreground", "text-on-info": "color-feedback-info-foreground",
  "focus-color": "color-focus-ring", "shadow-raised": "shadow-elevation-card",
};

function declarations(tokens, projection) {
  return Object.entries(projection).map(([name, path]) => `  --${name}: ${formatToken(tokenAt(tokens, path))};`);
}

function aliases() {
  return Object.entries(COMPATIBILITY_ALIASES).map(([name, target]) => `  --${name}: var(--${target});`);
}

function motionDeclarations(tokens) {
  return [
    `  --motion-duration: ${formatToken(tokenAt(tokens, "motion.semantic.duration.enter-180"))};`,
    `  --motion-ease: ${formatToken(tokenAt(tokens, "motion.semantic.easing.standard"))};`,
    `  --motion-iteration: ${formatToken(tokenAt(tokens, "motion.semantic.iteration"))};`,
  ];
}

function themeBlock(selector, mode, tokens, includeCommon = false) {
  const lines = [
    ...(includeCommon ? declarations(tokens, COMMON_PROJECTION) : []),
    `  color-scheme: ${mode};`,
    ...declarations(tokens, THEME_PROJECTION),
    ...aliases(),
    ...(includeCommon ? motionDeclarations(tokens) : []),
  ];
  return `${selector} {\n${lines.join("\n")}\n}`;
}

export function buildGeneratedThemeTokens(documents, resolver) {
  const themes = Object.keys(resolver.modifiers.theme.contexts);
  const defaultTheme = resolver.modifiers.theme.default;
  const defaultDark = resolver.$extensions["com.qr-pagamentos.theme"].defaultDark;
  const resolved = Object.fromEntries(themes.map((theme) => [theme, resolveDesignTokens(resolver, documents, { theme })]));
  const defaultResolution = resolved[defaultTheme];
  const darkResolution = resolved[defaultDark];
  const reduced = resolveDesignTokens(resolver, documents, { theme: defaultTheme, motion: "reduced" });
  const mode = (result) => result.tokens.$extensions["com.qr-pagamentos.theme"].mode;

  return [
    themeBlock(":root", mode(defaultResolution), defaultResolution.tokens, true),
    themeBlock(":root.dark", mode(darkResolution), darkResolution.tokens),
    `@media (prefers-color-scheme: dark) {\n${themeBlock("  :root:not([data-theme]):not(.light)", mode(darkResolution), darkResolution.tokens).split("\n").map((line, index) => index === 0 ? line : `  ${line}`).join("\n")}\n}`,
    ...themes.flatMap((theme) => [
      themeBlock(`:root[data-theme="${theme}"]`, mode(resolved[theme]), resolved[theme].tokens),
      themeBlock(`[data-theme-preview="${theme}"]`, mode(resolved[theme]), resolved[theme].tokens),
    ]),
    `@media (prefers-reduced-motion: reduce) {\n  :root {\n${motionDeclarations(reduced.tokens).map((line) => `  ${line}`).join("\n")}\n  }\n  *, *::before, *::after {\n    animation-duration: var(--motion-duration) !important;\n    animation-iteration-count: var(--motion-iteration) !important;\n    transition-duration: var(--motion-duration) !important;\n  }\n}`,
  ].join("\n\n");
}

export function projectGeneratedThemeTokens(css, documents, resolver) {
  const start = "/* generated-theme-tokens:start */";
  const end = "/* generated-theme-tokens:end */";
  const projection = `${start}\n${buildGeneratedThemeTokens(documents, resolver)}\n${end}`;
  const startIndex = css.indexOf(start);
  const endIndex = css.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) throw new Error("Generated theme marker is missing.");
  return `${css.slice(0, startIndex)}${projection}${css.slice(endIndex + end.length)}`;
}

async function main() {
  const [documents, resolver, css] = await Promise.all([
    loadTokenDocuments(), readFile(resolverPath, "utf8").then(JSON.parse), readFile(cssPath, "utf8"),
  ]);
  const next = projectGeneratedThemeTokens(css, documents, resolver);
  if (process.argv.includes("--check")) {
    if (next !== css) throw new Error("globals.css token projection is stale; run pnpm tokens:generate.");
    const { findDesignTokenViolations } = await import("./check-design-tokens.mjs");
    const violations = findDesignTokenViolations();
    if (violations.length > 0) throw new Error(`Raw visual values escaped the token boundary:\n${violations.join("\n")}`);
  } else await writeFile(cssPath, next);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

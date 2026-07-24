import resolver from "./tokens/resolver.json";

// The resolver's theme modifier is the single source of the closed theme set;
// themes.test.ts pins this export to the resolver keys so the two never drift.
export const STOREFRONT_THEME_IDS: readonly string[] = Object.freeze(
  Object.keys(resolver.modifiers.theme.contexts),
);

export const DEFAULT_STOREFRONT_THEME_ID: string = resolver.modifiers.theme.default;

export function isStorefrontThemeId(value: unknown): value is string {
  return typeof value === "string" && STOREFRONT_THEME_IDS.includes(value);
}

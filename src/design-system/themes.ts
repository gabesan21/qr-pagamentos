import resolver from "./tokens/resolver.json";

export type StorefrontThemeId = keyof typeof resolver.modifiers.theme.contexts;

// Persisted IDs and fallbacks remain server-owned; this adapter exports the
// resolver contract without introducing client storage or theme-ID branching.
export const STOREFRONT_THEME_IDS = Object.freeze(
  Object.keys(resolver.modifiers.theme.contexts) as StorefrontThemeId[],
);

export const DEFAULT_STOREFRONT_THEME_ID =
  resolver.modifiers.theme.default as StorefrontThemeId;
export const DARK_SYSTEM_STOREFRONT_THEME_ID: StorefrontThemeId =
  resolver.$extensions["com.qr-pagamentos.theme"].defaultDark as StorefrontThemeId;

export function isStorefrontThemeId(value: unknown): value is StorefrontThemeId {
  return typeof value === "string" && STOREFRONT_THEME_IDS.includes(value as StorefrontThemeId);
}

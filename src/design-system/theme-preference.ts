import { isStorefrontThemeId, type StorefrontThemeId } from "./themes";

/**
 * Client-writable, non-`HttpOnly` cookie carrying the signed-in principal's
 * authenticated-shell theme preference. The value has no authorization
 * effect, so it is never trusted without validation on every read.
 */
export const THEME_PREFERENCE_COOKIE_NAME = "qr_theme";

/**
 * Validates a raw cookie value against the closed theme-id registry.
 * Returns `undefined` for anything absent, malformed, or unrecognized so a
 * caller falls back to stamping no attribute at all.
 */
export function resolveThemePreference(
  rawCookieValue: string | undefined | null,
): StorefrontThemeId | undefined {
  return typeof rawCookieValue === "string" && isStorefrontThemeId(rawCookieValue)
    ? rawCookieValue
    : undefined;
}

/**
 * Builds the `document.cookie` string the client writes right after an
 * instant theme switch. Never `HttpOnly` — a client write cannot set that
 * flag — and `Secure` only when the caller reports a secure context, since
 * this module never reads `location` itself.
 */
export function buildThemePreferenceCookie(
  themeId: StorefrontThemeId,
  isSecureContext: boolean,
): string {
  const attributes = [
    `${THEME_PREFERENCE_COOKIE_NAME}=${themeId}`,
    "path=/",
    "max-age=31536000",
    "SameSite=Lax",
  ];
  if (isSecureContext) attributes.push("Secure");
  return attributes.join("; ");
}

/**
 * Maps each theme id to the existing flattened i18n dictionary key that
 * already names it for the storefront default-theme picker, so the shell
 * picker's options resolve their labels from that single set of strings
 * instead of introducing a duplicate name per theme.
 */
export const THEME_PREFERENCE_LABEL_KEYS = {
  "pix-paper": "storefrontThemePixPaper",
  "cashier-daylight": "storefrontThemeCashierDaylight",
  "settlement-sand": "storefrontThemeSettlementSand",
  "midnight-clearing": "storefrontThemeMidnightClearing",
  "vault-blue": "storefrontThemeVaultBlue",
  "terminal-amber": "storefrontThemeTerminalAmber",
} as const satisfies Record<StorefrontThemeId, string>;

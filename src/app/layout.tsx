import type { Metadata } from "next";
import { cookies } from "next/headers";

import { getAuthorizationService } from "../auth/authorization";
import { resolveThemePreference, THEME_PREFERENCE_COOKIE_NAME } from "../design-system/theme-preference";
import { getLocalePreferenceService } from "../i18n/locale-preference";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "../i18n/locales";
import "./globals.css";
import "../app-shell/app-shell.css";

export const metadata: Metadata = {
  title: "QR Pagamentos",
  description: "QR Pagamentos administrative platform",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestCookies = await cookies();
  const token = requestCookies.get("qr_session")?.value;
  const principal = token ? await getAuthorizationService().resolve(token) : null;
  const locale = principal
    ? await getLocalePreferenceService().resolve(principal.id)
    : localeFromPreferenceCookie(requestCookies.get(localePreferenceCookieName)?.value);
  // The theme cookie is client-writable and carries no authorization effect,
  // so it is only trusted for a resolved principal and only when it names
  // one of the six theme ids; anything else stamps no attribute and the
  // existing prefers-color-scheme fallback in globals.css keeps applying.
  // Public, unauthenticated surfaces never receive this attribute.
  const themeId = principal
    ? resolveThemePreference(requestCookies.get(THEME_PREFERENCE_COOKIE_NAME)?.value)
    : undefined;
  return (
    <html data-theme={themeId} lang={locale}>
      <body>{children}</body>
    </html>
  );
}

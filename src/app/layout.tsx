import type { Metadata } from "next";
import { cookies } from "next/headers";

import { getAuthorizationService } from "../auth/authorization";
import { resolveThemePreference, THEME_PREFERENCE_COOKIE_NAME } from "../design-system/theme-preference";
import { getDictionary } from "../i18n/dictionaries";
import { getLocalePreferenceService } from "../i18n/locale-preference";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "../i18n/locales";
import { NoticeToast, type NoticeToastEntry } from "./notice-toast";
import { ToastViewport } from "../components/ui/toast";
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
  const dictionary = getDictionary(locale);
  // The `/language-preference` redirect appends `?language=saved|error` to
  // whatever page it returns to; mounting this registry here (rather than in
  // each page) is what keeps that outcome visible on pages that render no
  // language banner of their own.
  const languageNotices: readonly NoticeToastEntry[] = [
    { param: "language", value: "saved", kind: "success", message: dictionary.languageSaved },
    { param: "language", value: "error", kind: "error", message: dictionary.languageError },
  ];
  return (
    <html data-theme={themeId} lang={locale}>
      <body>
        {children}
        <ToastViewport label={dictionary.toastRegionLabel} />
        <NoticeToast notices={languageNotices} />
      </body>
    </html>
  );
}

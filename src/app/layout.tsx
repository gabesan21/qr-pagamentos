import type { Metadata } from "next";
import { cookies } from "next/headers";

import { getAuthorizationService } from "../auth/authorization";
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
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}

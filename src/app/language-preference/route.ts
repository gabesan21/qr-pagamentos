import { cookies } from "next/headers";
import { getAuthorizationService } from "@/auth/authorization";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { isSupportedLocale, localePreferenceCookieName } from "@/i18n/locales";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { resolveSettingsReturnTarget } from "@/app/settings-return-target";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.languagePreference }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    const returnTarget = resolveSettingsReturnTarget(request);
    const anchor = new URL(returnTarget, "http://internal").pathname === "/settings" ? "#settings-language" : "";
    const redirectTo = (outcome: "saved" | "error") => {
      const url = new URL(returnTarget, "http://internal");
      url.searchParams.set("language", outcome);
      return `${url.pathname}${url.search}${anchor}` as `/${string}`;
    };

    const locale = (await request.formData()).get("locale");
    const principal = await getAuthorizationService().resolve((await cookies()).get("qr_session")?.value);

    // Anonymous caller: no session to persist a preference against, so the locale choice
    // is carried entirely by the same qr_locale cookie the root layout, login, reset and
    // /design-system already read for anonymous resolution — no authentication change.
    if (!principal) {
      if (typeof locale !== "string" || !isSupportedLocale(locale)) return relativeRedirect(redirectTo("error"));
      const response = relativeRedirect(redirectTo("saved"));
      response.cookies.set(localePreferenceCookieName, locale, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 31_536_000,
      });
      return response;
    }

    try { await getLocalePreferenceService().set(principal.id, typeof locale === "string" ? locale : ""); }
    catch { return relativeRedirect(redirectTo("error")); }
    return relativeRedirect(redirectTo("saved"));
  });
}

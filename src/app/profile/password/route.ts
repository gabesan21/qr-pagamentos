import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getProfileService } from "@/auth/profile";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { defaultLocale, localePreferenceCookieName } from "@/i18n/locales";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.profilePassword }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      await getProfileService().changePassword(actor, {
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword"),
        confirmation: form.get("confirmation"),
      });
      const locale = await getLocalePreferenceService().resolve(actor.id).catch(() => defaultLocale);
      const response = relativeRedirect("/login?password=changed");
      response.cookies.set("qr_session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
      });
      response.cookies.set(localePreferenceCookieName, locale, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 31_536_000,
      });
      return response;
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect("/profile?password=failed");
    }
  });
}

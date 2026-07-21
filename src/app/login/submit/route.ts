import { getAuthorizationService } from "@/auth/authorization";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { negotiateLocale } from "@/i18n/locales";
import { getSessionService, SESSION_ABSOLUTE_MS } from "@/auth/session";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_ABSOLUTE_MS / 1000 };

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.loginSubmit }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const form = await request.formData();
    const username = form.get("username"); const password = form.get("password");
    const session = getSessionService();
    const token = typeof username === "string" && typeof password === "string" ? await session.signIn(username, password) : null;
    if (!token) return relativeRedirect("/login?error=invalid-credentials");
    const principal = await getAuthorizationService().resolve(token);
    if (!principal) return relativeRedirect("/login?error=invalid-credentials");
    await getLocalePreferenceService().resolve(principal.id, negotiateLocale(request.headers.get("accept-language")));
    const response = relativeRedirect("/");
    response.cookies.set("qr_session", token, cookieOptions);
    return response;
  });
}

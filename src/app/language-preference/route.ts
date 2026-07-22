import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthorizationService } from "@/auth/authorization";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.languagePreference }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const principal = await getAuthorizationService().resolve((await cookies()).get("qr_session")?.value);
    if (!principal) return new NextResponse(null, { status: 401 });
    const locale = (await request.formData()).get("locale");
    try { await getLocalePreferenceService().set(principal.id, typeof locale === "string" ? locale : ""); }
    catch { return relativeRedirect("/?language=error"); }
    return relativeRedirect("/?language=saved");
  });
}

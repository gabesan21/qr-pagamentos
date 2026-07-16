import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { getSessionService } from "@/auth/session";

export async function POST(request: Request) {
  const principal = await getSessionService().validate((await cookies()).get("qr_session")?.value);
  if (!principal) return new NextResponse(null, { status: 401 });
  const locale = (await request.formData()).get("locale");
  try { await getLocalePreferenceService().set(principal.userId, typeof locale === "string" ? locale : ""); }
  catch { return NextResponse.redirect(new URL("/?language=error", request.url), { status: 303 }); }
  return NextResponse.redirect(new URL("/?language=saved", request.url), { status: 303 });
}

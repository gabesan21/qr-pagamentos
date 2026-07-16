import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSessionService } from "../../../auth/session";
import { isSupportedLocale } from "../../../i18n/locales";

const sessionCookie = "qr_session";

export async function POST(request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isSupportedLocale(lang)) return new NextResponse(null, { status: 404 });
  const cookieStore = await cookies();
  await getSessionService().logout(cookieStore.get(sessionCookie)?.value);
  const response = NextResponse.redirect(new URL(`/${lang}/login`, request.url), { status: 303 });
  response.cookies.set(sessionCookie, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

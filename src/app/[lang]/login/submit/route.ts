import { NextResponse } from "next/server";

import { getSessionService, SESSION_ABSOLUTE_MS } from "../../../../auth/session";
import { isSupportedLocale } from "../../../../i18n/locales";

const sessionCookie = "qr_session";
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_ABSOLUTE_MS / 1000 };

export async function POST(request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isSupportedLocale(lang)) return new NextResponse(null, { status: 404 });
  const form = await request.formData();
  const username = form.get("username");
  const password = form.get("password");
  const token = typeof username === "string" && typeof password === "string" ? await getSessionService().signIn(username, password) : null;
  if (!token) return NextResponse.redirect(new URL(`/${lang}/login?error=invalid-credentials`, request.url), { status: 303 });
  const response = NextResponse.redirect(new URL(`/${lang}`, request.url), { status: 303 });
  response.cookies.set(sessionCookie, token, cookieOptions);
  return response;
}

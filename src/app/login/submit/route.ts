import { NextResponse } from "next/server";
import { getAuthorizationService } from "@/auth/authorization";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { negotiateLocale } from "@/i18n/locales";
import { getSessionService, SESSION_ABSOLUTE_MS } from "@/auth/session";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_ABSOLUTE_MS / 1000 };

export async function POST(request: Request) {
  const form = await request.formData();
  const username = form.get("username"); const password = form.get("password");
  const session = getSessionService();
  const token = typeof username === "string" && typeof password === "string" ? await session.signIn(username, password) : null;
  if (!token) return NextResponse.redirect(new URL("/login?error=invalid-credentials", request.url), { status: 303 });
  const principal = await getAuthorizationService().resolve(token);
  if (!principal) return NextResponse.redirect(new URL("/login?error=invalid-credentials", request.url), { status: 303 });
  await getLocalePreferenceService().resolve(principal.id, negotiateLocale(request.headers.get("accept-language")));
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.cookies.set("qr_session", token, cookieOptions);
  return response;
}

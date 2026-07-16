import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionService } from "@/auth/session";

export async function POST(request: Request) {
  await getSessionService().logout((await cookies()).get("qr_session")?.value);
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  response.cookies.set("qr_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

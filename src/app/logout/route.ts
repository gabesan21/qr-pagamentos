import { cookies } from "next/headers";
import { getSessionService } from "@/auth/session";
import { relativeRedirect } from "@/app/relative-redirect";

export async function POST() {
  await getSessionService().logout((await cookies()).get("qr_session")?.value);
  const response = relativeRedirect("/login");
  response.cookies.set("qr_session", "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

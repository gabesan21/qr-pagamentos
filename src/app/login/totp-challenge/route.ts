import { cookies } from "next/headers";

import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getMfaChallengeService } from "@/auth/mfa-challenge";
import { getSessionService, SESSION_ABSOLUTE_MS } from "@/auth/session";
import { getTotpService } from "@/auth/totp-store";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

const sessionCookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_ABSOLUTE_MS / 1000 };
const clearedChallengeOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 };

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.loginTotpChallenge }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const challengeCookie = (await cookies()).get("qr_mfa_challenge")?.value;
    const challenge = challengeCookie ? await getMfaChallengeService().validate(challengeCookie) : null;
    if (!challenge) {
      return relativeRedirect("/login?error=invalid-credentials");
    }
    const form = await request.formData();
    const codeValue = form.get("code");
    const code = typeof codeValue === "string" ? codeValue : "";
    const service = getTotpService();
    const validTotp = await service.validate(challenge.userId, code);
    const validRecovery = !validTotp && await service.validateWithRecoveryCode(challenge.userId, code);
    if (!validTotp && !validRecovery) {
      return relativeRedirect("/login?mfa=failed");
    }
    const sessionToken = await getSessionService().createMfaVerified(challenge.userId);
    const response = relativeRedirect("/");
    response.cookies.set("qr_session", sessionToken, sessionCookieOptions);
    response.cookies.set("qr_mfa_challenge", "", clearedChallengeOptions);
    return response;
  });
}

import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getProfileService } from "@/auth/profile";
import { getSessionService, SESSION_ABSOLUTE_MS } from "@/auth/session";
import { getTotpService } from "@/auth/totp-store";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_ABSOLUTE_MS / 1000,
};

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
      // The service already revoked every prior session (including the
      // submitting one) inside the user lock. Issue one fresh session for
      // the same actor so the merchant stays signed in; use the
      // MFA-verified constructor when TOTP is active so the recorded
      // fact is not silently downgraded.
      const totpActive = await getTotpService().isEnrolled(actor.id);
      const sessionService = getSessionService();
      const token = totpActive ? await sessionService.createMfaVerified(actor.id) : await sessionService.create(actor.id);
      const response = relativeRedirect("/profile?password=changed");
      response.cookies.set("qr_session", token, sessionCookieOptions);
      return response;
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect("/profile?password=failed");
    }
  });
}

import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import {
  getPasswordResetService,
  PasswordResetUnavailableError,
  PasswordResetValidationError,
} from "@/auth/password-reset";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.resetPassword }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;

    const form = await request.formData();
    const token = form.get("token");
    const newPassword = form.get("newPassword");
    const confirmation = form.get("confirmation");

    const tokenString = typeof token === "string" ? token : "";
    const failureRedirect = relativeRedirect(`/reset-password?token=${encodeURIComponent(tokenString)}&error=failed`);

    if (typeof newPassword !== "string" || typeof confirmation !== "string" || newPassword !== confirmation || !tokenString) {
      return failureRedirect;
    }

    try {
      await getPasswordResetService().consumeResetChallenge(tokenString, newPassword);
      return relativeRedirect("/login?password=changed");
    } catch (error) {
      if (error instanceof PasswordResetValidationError || error instanceof PasswordResetUnavailableError) {
        return failureRedirect;
      }
      return failureRedirect;
    }
  });
}

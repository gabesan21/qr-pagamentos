import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { verifyCurrentPassword } from "@/auth/password-verification";
import { getTotpService } from "@/auth/totp-store";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.profileTotpConfirm }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      const currentPasswordValue = form.get("currentPassword");
      const codeValue = form.get("code");
      const currentPassword = typeof currentPasswordValue === "string" ? currentPasswordValue : "";
      const code = typeof codeValue === "string" ? codeValue : "";
      if (!await verifyCurrentPassword(actor.id, currentPassword)) {
        return relativeRedirect("/profile?totp=failed");
      }
      await getTotpService().confirm(actor.id, code);
      return relativeRedirect("/profile?totp=confirmed");
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect("/profile?totp=failed");
    }
  });
}

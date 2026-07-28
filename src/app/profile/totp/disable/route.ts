import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { verifyCurrentPassword } from "@/auth/password-verification";
import { getTotpService } from "@/auth/totp-store";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.profileTotpDisable }, async () => {
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
      const service = getTotpService();
      const validTotp = await service.validate(actor.id, code);
      const validRecovery = !validTotp && await service.validateWithRecoveryCode(actor.id, code);
      if (!validTotp && !validRecovery) {
        return relativeRedirect("/profile?totp=failed");
      }
      await service.disable(actor.id);
      return relativeRedirect("/profile?totp=disabled");
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect("/profile?totp=failed");
    }
  });
}

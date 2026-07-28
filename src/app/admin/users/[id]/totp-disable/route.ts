import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getAdminTotpRecoveryService, AdminTotpRecoveryTargetNotFoundError } from "@/auth/admin-totp-recovery";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminUserTotpDisable }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const id = (await params).id;
    try {
      const actor = await requireAdminFromCookie();
      await getAdminTotpRecoveryService().disable(actor, id);
      return relativeRedirect(`/admin/accounts/${encodeURIComponent(id)}?editor=totp-disabled`);
    } catch (error) {
      const protectedResponse = protectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      if (error instanceof AdminTotpRecoveryTargetNotFoundError) {
        return relativeRedirect(`/admin/accounts/${encodeURIComponent(id)}?editor=failed`);
      }
      return relativeRedirect(`/admin/accounts/${encodeURIComponent(id)}?editor=failed`);
    }
  });
}

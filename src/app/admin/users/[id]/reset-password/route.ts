import { AdminPasswordResetUnavailableError, getAdminPasswordResetService } from "@/auth/admin-password-reset";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminUserResetPassword }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const id = (await params).id;
    const editorRedirect = (notice: string) => relativeRedirect(`/admin/accounts/${encodeURIComponent(id)}?reset=${notice}`);
    try {
      const admin = await requireAdminFromCookie();
      await getAdminPasswordResetService().sendResetEmail(id, admin);
      return editorRedirect("requested");
    } catch (error) {
      console.error("ADMIN_RESET_DIAG", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
      const protectedResponse = protectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      if (error instanceof AdminPasswordResetUnavailableError) return editorRedirect("failed");
      return editorRedirect("failed");
    }
  });
}

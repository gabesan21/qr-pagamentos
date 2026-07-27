import { getAdminUserProfileService } from "@/auth/admin-user-profile";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminUserCheckoutPolicy }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const id = (await params).id;
    const editorRedirect = (notice: string) => relativeRedirect(`/admin/accounts/${encodeURIComponent(id)}?editor=${notice}`);
    try {
      const actor = await requireAdminFromCookie();
      const policy = (await request.formData()).get("policy");
      await getAdminUserProfileService().updateCheckoutPolicy(actor, id, { policy });
      return editorRedirect("changed");
    } catch (error) {
      const protectedResponse = protectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return editorRedirect("failed");
    }
  });
}

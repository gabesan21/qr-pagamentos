import {
  AdminUserProfileConflictError,
  getAdminUserProfileService,
} from "@/auth/admin-user-profile";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminUserStorefront }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const id = (await params).id;
    const editorRedirect = (notice: string) => relativeRedirect(`/admin/accounts/${encodeURIComponent(id)}?editor=${notice}`);
    try {
      const actor = await requireAdminFromCookie();
      const form = await request.formData();
      await getAdminUserProfileService().updateStorefront(actor, id, {
        storefrontSlug: form.get("storefrontSlug"),
        storefrontDisplayNamePtBr: form.get("storefrontDisplayNamePtBr"),
        storefrontDisplayNameEn: form.get("storefrontDisplayNameEn"),
        storefrontAccentColor: form.get("storefrontAccentColor"),
        storefrontEnabled: form.get("storefrontEnabled"),
        storefrontThemeId: form.get("storefrontThemeId"),
        storefrontLayout: form.get("storefrontLayout"),
        storefrontStandalonePaymentsEnabled: form.get("storefrontStandalonePaymentsEnabled"),
        storefrontDefaultCurrencyCode: form.get("storefrontDefaultCurrencyCode"),
      });
      return editorRedirect("changed");
    } catch (error) {
      const protectedResponse = protectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      if (error instanceof AdminUserProfileConflictError) return editorRedirect("conflict");
      return editorRedirect("failed");
    }
  });
}

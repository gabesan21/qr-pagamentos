import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getStorefrontSettingsService, StorefrontSettingsConflictError } from "@/auth/storefront-settings";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.storefront }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      await getStorefrontSettingsService().update(actor, {
        storefrontSlug: form.get("storefrontSlug"),
        storefrontDisplayNamePtBr: form.get("storefrontDisplayNamePtBr"),
        storefrontDisplayNameEn: form.get("storefrontDisplayNameEn"),
        storefrontAccentColor: form.get("storefrontAccentColor"),
        storefrontEnabled: form.get("storefrontEnabled"),
      });
      return relativeRedirect("/?storefront=changed");
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect(error instanceof StorefrontSettingsConflictError ? "/?storefront=conflict" : "/?storefront=failed");
    }
  });
}

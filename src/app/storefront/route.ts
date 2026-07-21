import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getStorefrontSettingsService, StorefrontSettingsConflictError } from "@/auth/storefront-settings";

export async function POST(request: Request) {
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
}

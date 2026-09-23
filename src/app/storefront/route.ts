import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import {
  getStorefrontSettingsService,
  StorefrontSettingsConflictError,
  type StorefrontSettingsData,
} from "@/auth/storefront-settings";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

// Extended fields participate only when the form carries them; the legacy
// dashboard card omits them and must never clear the stored values.
const EXTENDED_FIELDS = [
  "storefrontThemeId",
  "storefrontLayout",
  "storefrontLogoMediaIdentifier",
  "storefrontStandalonePaymentsEnabled",
  "storefrontDefaultCurrencyCode",
] as const;

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.storefront }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      const input: Partial<Record<keyof StorefrontSettingsData, unknown>> = {
        storefrontSlug: form.get("storefrontSlug"),
        storefrontDisplayNamePtBr: form.get("storefrontDisplayNamePtBr"),
        storefrontDisplayNameEn: form.get("storefrontDisplayNameEn"),
        storefrontAccentColor: form.get("storefrontAccentColor"),
        storefrontEnabled: form.get("storefrontEnabled"),
      };
      for (const field of EXTENDED_FIELDS) {
        if (form.has(field)) input[field] = form.get(field);
      }
      await getStorefrontSettingsService().update(actor, input);
      return relativeRedirect("/settings?storefront=changed#settings-identity");
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect(
        error instanceof StorefrontSettingsConflictError
          ? "/settings?storefront=conflict#settings-identity"
          : "/settings?storefront=failed#settings-identity",
      );
    }
  });
}

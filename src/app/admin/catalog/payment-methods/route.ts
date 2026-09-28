import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getNauttCatalogService } from "@/auth/nautt-catalog";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminPaymentMethods }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireAdminFromCookie();
      const form = await request.formData();
      // CatalogPaymentMethod is retained only for historical data. New methods
      // are real CatalogCurrencyPair rows bound to a configured currency.
      await getNauttCatalogService().createCurrencyMethod(actor, {
        label: form.get("label"),
        currencyCode: form.get("currencyCode"),
        exchangeCurrencyUuid: form.get("exchangeCurrencyUuid"),
      });
      return relativeRedirect("/admin/settings?success=method-created");
    } catch (error) {
      const protectedResponse = protectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect("/admin/settings?error=method-failed");
    }
  });
}

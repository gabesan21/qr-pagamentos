import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getNauttCatalogService } from "@/auth/nautt-catalog";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ id: string }> }>) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminPaymentMethod }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireAdminFromCookie();
      const { id } = await params;
      const form = await request.formData();
      const intent = String(form.get("intent") ?? "");
      const service = getNauttCatalogService();
      if (intent === "toggle-active") {
        await service.setCurrencyPairActive(actor, id, true);
      } else if (intent === "toggle-inactive") {
        await service.setCurrencyPairActive(actor, id, false);
      } else if (intent === "set-default") {
        await service.setDefaultCurrencyMethod(actor, form.get("currencyCode"), id);
      } else {
        await service.updateCurrencyPair(actor, id, form.get("label"));
      }
      return relativeRedirect("/admin/settings?success=method-changed");
    } catch (error) {
      const protectedResponse = protectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect("/admin/settings?error=method-failed");
    }
  });
}

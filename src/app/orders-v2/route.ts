import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getOrderV2Service } from "@/orders/order-v2";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.ordersV2 }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      await getOrderV2Service().createAdHoc(actor, {
        amount: form.get("amount"),
        currencyPairId: form.get("currencyPairId"),
        descriptionPtBr: form.get("descriptionPtBr"),
        descriptionEn: form.get("descriptionEn"),
        checkoutDataPolicy: form.get("checkoutDataPolicy"),
        customer: form.get("customer"),
      });
      return relativeRedirect("/orders?orders-v2=created");
    } catch (error) {
      return ownerProtectedMutationResponse(error) ?? relativeRedirect("/orders?orders-v2=failed");
    }
  });
}

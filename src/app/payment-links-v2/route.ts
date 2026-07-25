import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getPaymentLinkV2Service } from "@/auth/payment-link-v2";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.paymentLinksV2 }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      await getPaymentLinkV2Service().create(actor, {
        compositionKind: form.get("compositionKind"),
        currencyPairId: form.get("currencyPairId"),
        linkType: form.get("linkType"),
        expiresAt: form.get("expiresAt"),
        lines: form.get("lines"),
        descriptionPtBr: form.get("descriptionPtBr"),
        descriptionEn: form.get("descriptionEn"),
        amount: form.get("amount"),
      });
      return relativeRedirect("/links?payment-links-v2=created");
    } catch (error) {
      return ownerProtectedMutationResponse(error) ?? relativeRedirect("/links?payment-links-v2=failed");
    }
  });
}

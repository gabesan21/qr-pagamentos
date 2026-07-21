import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getPaymentLinkService } from "@/auth/payment-link";

export async function POST(request: Request) {
  try {
    const actor = await requireOwnerFromCookie();
    const form = await request.formData();
    await getPaymentLinkService().create(actor, { productId: form.get("productId"), currencyPairId: form.get("currencyPairId"), linkType: form.get("linkType"), expiresAt: form.get("expiresAt") });
    return relativeRedirect("/?payment-links=created");
  } catch (error) {
    return ownerProtectedMutationResponse(error) ?? relativeRedirect("/?payment-links=failed");
  }
}

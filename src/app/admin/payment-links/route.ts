import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getPaymentLinkService } from "@/auth/payment-link";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminFromCookie();
    const form = await request.formData();
    await getPaymentLinkService().create(actor, {
      productId: form.get("productId"),
      currencyPairId: form.get("currencyPairId"),
      linkType: form.get("linkType"),
      expiresAt: form.get("expiresAt"),
    });
    return relativeRedirect("/admin?success=payment-link-created");
  } catch (error) {
    return protectedMutationResponse(error) ?? relativeRedirect("/admin?error=payment-link-mutation-failed");
  }
}

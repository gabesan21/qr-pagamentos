import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getNauttCatalogService } from "@/auth/nautt-catalog";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminFromCookie();
    const form = await request.formData();
    await getNauttCatalogService().createPaymentMethod(actor, {
      label: form.get("label"),
      paymentMethodUuid: form.get("paymentMethodUuid"),
    });
    return relativeRedirect("/admin?success=catalog-created");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return relativeRedirect("/admin?error=catalog-create-failed");
  }
}

import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getNauttCatalogService } from "@/auth/nautt-catalog";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminFromCookie();
    const form = await request.formData();
    await getNauttCatalogService().createCurrencyPair(actor, {
      label: form.get("label"),
      currencyUuid: form.get("currencyUuid"),
      exchangeCurrencyUuid: form.get("exchangeCurrencyUuid"),
    });
    return relativeRedirect("/admin?success=catalog-created");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return relativeRedirect("/admin?error=catalog-create-failed");
  }
}

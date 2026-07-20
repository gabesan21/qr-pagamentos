import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getNauttCatalogService } from "@/auth/nautt-catalog";

export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ id: string }> }>) {
  try {
    const actor = await requireAdminFromCookie();
    const { id } = await params;
    const form = await request.formData();
    const intent = String(form.get("intent") ?? "");
    const service = getNauttCatalogService();
    if (intent === "toggle-active") {
      await service.setPaymentMethodActive(actor, id, true);
    } else if (intent === "toggle-inactive") {
      await service.setPaymentMethodActive(actor, id, false);
    } else {
      await service.updatePaymentMethod(actor, id, form.get("label"));
    }
    return relativeRedirect("/admin?success=catalog-changed");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return relativeRedirect("/admin?error=catalog-change-failed");
  }
}

import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getProductService, ProductConflictError } from "@/auth/product";

function productValues(form: FormData) {
  return {
    internalName: form.get("internalName"),
    titlePtBr: form.get("titlePtBr"),
    titleEn: form.get("titleEn"),
    descriptionPtBr: form.get("descriptionPtBr"),
    descriptionEn: form.get("descriptionEn"),
    price: form.get("price"),
  };
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminFromCookie();
    const form = await request.formData();
    const service = getProductService();
    const action = form.get("action");

    if (action === "create") {
      await service.create(actor, productValues(form));
    } else if (action === "update") {
      await service.update(actor, form.get("id"), form.get("version"), productValues(form));
    } else if (action === "active") {
      await service.setActive(actor, form.get("id"), form.get("version"), form.get("active"));
    } else if (action === "delete") {
      await service.delete(actor, form.get("id"), form.get("version"));
    } else {
      throw new Error("Unsupported product action");
    }

    return relativeRedirect(`/admin?success=product-${action}`);
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    if (error instanceof ProductConflictError) return relativeRedirect("/admin?error=product-conflict");
    return relativeRedirect("/admin?error=product-mutation-failed");
  }
}

import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getProductService, ProductConflictError } from "@/auth/product";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

function productValues(form: FormData) {
  return {
    internalName: form.get("internalName"),
    titlePtBr: form.get("titlePtBr"),
    titleEn: form.get("titleEn"),
    descriptionPtBr: form.get("descriptionPtBr"),
    descriptionEn: form.get("descriptionEn"),
    price: form.get("price"),
    // Absent keys leave the stored catalog-media values unchanged; an
    // explicitly submitted blank clears them.
    ...(form.has("categoryId") ? { categoryId: form.get("categoryId") } : {}),
    ...(form.has("currencyCode") ? { currencyCode: form.get("currencyCode") } : {}),
    ...(form.has("imageMediaId") ? { imageMediaId: form.get("imageMediaId") } : {}),
  };
}

// The failing form is derived only from the submitted action/id, never from
// client-supplied path: create returns to the create form, update/active/
// archive return to the same product's detail form, and every other action
// falls back to the catalog list as before.
function productFailureTarget(action: FormDataEntryValue | null, id: FormDataEntryValue | null): `/${string}` {
  if (action === "create") return "/catalog/products/new";
  if ((action === "update" || action === "active" || action === "archive") && typeof id === "string" && id) {
    return `/catalog/products/${encodeURIComponent(id)}`;
  }
  return "/catalog";
}

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.products }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    let action: FormDataEntryValue | null = null;
    let id: FormDataEntryValue | null = null;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      const service = getProductService();
      action = form.get("action");
      id = form.get("id");
      if (action === "create") await service.create(actor, productValues(form));
      else if (action === "update") await service.update(actor, form.get("id"), form.get("version"), productValues(form));
      else if (action === "active") await service.setActive(actor, form.get("id"), form.get("version"), form.get("active"));
      else if (action === "archive") await service.archive(actor, form.get("id"), form.get("version"));
      else if (action === "delete") await service.delete(actor, form.get("id"), form.get("version"));
      else throw new Error("Unsupported product action");
      return relativeRedirect(`/catalog?products=${action}`);
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      const notice = error instanceof ProductConflictError ? "conflict" : "failed";
      return relativeRedirect(`${productFailureTarget(action, id)}?products=${notice}`);
    }
  });
}

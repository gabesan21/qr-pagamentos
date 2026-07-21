import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getProductService, ProductConflictError } from "@/auth/product";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

function productValues(form: FormData) {
  return { internalName: form.get("internalName"), titlePtBr: form.get("titlePtBr"), titleEn: form.get("titleEn"), descriptionPtBr: form.get("descriptionPtBr"), descriptionEn: form.get("descriptionEn"), price: form.get("price") };
}

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.products }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      const service = getProductService();
      const action = form.get("action");
      if (action === "create") await service.create(actor, productValues(form));
      else if (action === "update") await service.update(actor, form.get("id"), form.get("version"), productValues(form));
      else if (action === "active") await service.setActive(actor, form.get("id"), form.get("version"), form.get("active"));
      else if (action === "delete") await service.delete(actor, form.get("id"), form.get("version"));
      else throw new Error("Unsupported product action");
      return relativeRedirect(`/?products=${action}`);
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect(error instanceof ProductConflictError ? "/?products=conflict" : "/?products=failed");
    }
  });
}

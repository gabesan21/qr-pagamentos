import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import {
  getProductCategoryService,
  ProductCategoryConflictError,
} from "@/auth/product-category";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

function values(form: FormData) {
  return {
    namePtBr: form.get("namePtBr"),
    nameEn: form.get("nameEn"),
  };
}

export async function POST(request: Request) {
  return withServerRequestLog(
    request.headers.get("x-request-id"),
    { method: "POST", route: serverRequestRoutes.productCategories },
    async () => {
      const crossOrigin = rejectCrossOrigin(request);
      if (crossOrigin) return crossOrigin;
      try {
        const actor = await requireOwnerFromCookie();
        const form = await request.formData();
        const service = getProductCategoryService();
        const action = form.get("action");
        if (action === "create") {
          await service.create(actor, values(form));
        } else if (action === "edit") {
          await service.update(actor, form.get("id"), form.get("version"), values(form));
        } else if (action === "deactivate") {
          await service.deactivate(actor, form.get("id"), form.get("version"), form.get("replacementId"));
        } else {
          throw new Error("Unsupported category action");
        }
        return relativeRedirect(`/?categories=${action}`);
      } catch (error) {
        const protectedResponse = ownerProtectedMutationResponse(error);
        if (protectedResponse) return protectedResponse;
        return relativeRedirect(
          error instanceof ProductCategoryConflictError
            ? "/?categories=conflict"
            : "/?categories=failed",
        );
      }
    },
  );
}

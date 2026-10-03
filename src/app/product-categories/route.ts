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


function opaqueInlineFailure(outcome: "conflict" | "failed"): Response {
  return Response.json({ outcome }, { status: 409, headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  return withServerRequestLog(
    request.headers.get("x-request-id"),
    { method: "POST", route: serverRequestRoutes.productCategories },
    async () => {
      const crossOrigin = rejectCrossOrigin(request);
      if (crossOrigin) return crossOrigin;
      let wantsInlineCreate = false;
      try {
        const actor = await requireOwnerFromCookie();
        const form = await request.formData();
        const service = getProductCategoryService();
        const action = form.get("action");
        wantsInlineCreate = action === "create" && request.headers.get("accept")?.split(",").some(
          (part) => part.trim().split(";")[0] === "application/json",
        ) === true;
        if (action === "create") {
          const category = await service.create(actor, values(form));
          if (wantsInlineCreate) {
            return Response.json({ id: category.id, namePtBr: category.namePtBr, nameEn: category.nameEn }, {
              headers: { "Cache-Control": "no-store" },
            });
          }
        } else if (action === "edit") {
          await service.update(actor, form.get("id"), form.get("version"), values(form));
        } else if (action === "deactivate") {
          await service.deactivate(actor, form.get("id"), form.get("version"), form.get("replacementId"));
        } else {
          throw new Error("Unsupported category action");
        }
        return relativeRedirect(`/catalog/categories?categories=${action}`);
      } catch (error) {
        const protectedResponse = ownerProtectedMutationResponse(error);
        if (protectedResponse) return protectedResponse;
        if (wantsInlineCreate) {
          return opaqueInlineFailure(error instanceof ProductCategoryConflictError ? "conflict" : "failed");
        }
        return relativeRedirect(
          error instanceof ProductCategoryConflictError
            ? "/catalog/categories?categories=conflict"
            : "/catalog/categories?categories=failed",
        );
      }
    },
  );
}

import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getPaymentLinkV2Service } from "@/auth/payment-link-v2";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

// Failure returns to the create form the merchant was on, including the
// honest supersede variant `/links/new?from=<id>`; `from` only ever echoes
// back into the fixed `/links/new` path, it never becomes the destination
// itself, so it carries no open-redirect risk.
function createFailureTarget(from: FormDataEntryValue | null): `/${string}` {
  return typeof from === "string" && from ? `/links/new?from=${encodeURIComponent(from)}` : "/links/new";
}

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.paymentLinksV2 }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    let from: FormDataEntryValue | null = null;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      from = form.get("from");
      const created = await getPaymentLinkV2Service().create(actor, {
        compositionKind: form.get("compositionKind"),
        currencyPairId: form.get("currencyPairId"),
        linkType: form.get("linkType"),
        expiresAt: form.get("expiresAt"),
        lines: form.get("lines"),
        descriptionPtBr: form.get("descriptionPtBr"),
        descriptionEn: form.get("descriptionEn"),
        amount: form.get("amount"),
      });
      return relativeRedirect(`/links/v2/${created.id}?payment-links-v2=created`);
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      const target = createFailureTarget(from);
      return relativeRedirect(`${target}${target.includes("?") ? "&" : "?"}payment-links-v2=failed`);
    }
  });
}

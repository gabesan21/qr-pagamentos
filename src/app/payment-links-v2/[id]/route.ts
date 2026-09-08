import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getPaymentLinkV2Service } from "@/auth/payment-link-v2";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

function editInput(form: FormData): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of ["expiresAt", "lines", "descriptionPtBr", "descriptionEn", "amount"]) {
    if (form.has(key)) input[key] = form.get(key);
  }
  return input;
}

// Every branch returns to this link's detail — the id comes from the trusted
// route param, never from submitted input — except an edit failure, which is
// the one case that must show the form again so the merchant can fix it.
export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ id: string }> }>) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.paymentLinkV2 }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    const id = (await params).id;
    let action: FormDataEntryValue | null = null;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      const service = getPaymentLinkV2Service();
      action = form.get("action");
      let outcome: string;
      if (action === "edit") {
        await service.edit(actor, id, form.get("version"), editInput(form));
        outcome = "edited";
      } else if (action === "activate") {
        await service.setActive(actor, id, form.get("version"), "true");
        outcome = "activated";
      } else if (action === "deactivate") {
        await service.setActive(actor, id, form.get("version"), "false");
        outcome = "deactivated";
      } else {
        return relativeRedirect(`/links/v2/${id}?payment-links-v2=failed`);
      }
      return relativeRedirect(`/links/v2/${id}?payment-links-v2=${outcome}`);
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      const target: `/${string}` = action === "edit" ? `/links/v2/${id}/edit` : `/links/v2/${id}`;
      return relativeRedirect(`${target}?payment-links-v2=failed`);
    }
  });
}

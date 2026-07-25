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

export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ id: string }> }>) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.paymentLinkV2 }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      const service = getPaymentLinkV2Service();
      const id = (await params).id;
      const action = form.get("action");
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
        return relativeRedirect("/links?payment-links-v2=failed");
      }
      return relativeRedirect(`/links?payment-links-v2=${outcome}`);
    } catch (error) {
      return ownerProtectedMutationResponse(error) ?? relativeRedirect("/links?payment-links-v2=failed");
    }
  });
}

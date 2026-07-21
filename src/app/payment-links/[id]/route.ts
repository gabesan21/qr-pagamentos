import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getPaymentLinkService } from "@/auth/payment-link";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ id: string }> }>) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.paymentLink }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      await getPaymentLinkService().deactivate(actor, (await params).id);
      return relativeRedirect("/?payment-links=revoked");
    } catch (error) {
      return ownerProtectedMutationResponse(error) ?? relativeRedirect("/?payment-links=failed");
    }
  });
}

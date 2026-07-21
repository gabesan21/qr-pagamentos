import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getPaymentLinkService } from "@/auth/payment-link";

export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  try {
    const actor = await requireOwnerFromCookie();
    await getPaymentLinkService().deactivate(actor, (await params).id);
    return relativeRedirect("/?payment-links=revoked");
  } catch (error) {
    return ownerProtectedMutationResponse(error) ?? relativeRedirect("/?payment-links=failed");
  }
}

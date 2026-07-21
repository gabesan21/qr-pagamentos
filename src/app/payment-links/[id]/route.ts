import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getPaymentLinkService } from "@/auth/payment-link";

export async function POST(_request: Request, { params }: Readonly<{ params: Promise<{ id: string }> }>) {
  try {
    const actor = await requireOwnerFromCookie();
    await getPaymentLinkService().deactivate(actor, (await params).id);
    return relativeRedirect("/?payment-links=revoked");
  } catch (error) {
    return ownerProtectedMutationResponse(error) ?? relativeRedirect("/?payment-links=failed");
  }
}

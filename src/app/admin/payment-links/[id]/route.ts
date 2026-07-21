import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getPaymentLinkService } from "@/auth/payment-link";

export async function POST(_request: Request, { params }: Readonly<{ params: Promise<{ id: string }> }>) {
  try {
    const actor = await requireAdminFromCookie();
    await getPaymentLinkService().deactivate(actor, (await params).id);
    return relativeRedirect("/admin?success=payment-link-revoked");
  } catch (error) {
    return protectedMutationResponse(error) ?? relativeRedirect("/admin?error=payment-link-mutation-failed");
  }
}

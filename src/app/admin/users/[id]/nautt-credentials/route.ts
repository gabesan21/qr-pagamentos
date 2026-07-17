import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { loadNauttWebhookCallbackUrl } from "@/integrations/nautt/config";
import { getOwnerOnboardingService } from "@/integrations/nautt/owner-onboarding";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminFromCookie();
    const apiKey = (await request.formData()).get("apiKey");
    await getOwnerOnboardingService().onboard(
      actor,
      (await params).id,
      typeof apiKey === "string" ? apiKey : "",
      loadNauttWebhookCallbackUrl(),
    );
    return relativeRedirect("/admin?success=nautt-credentials");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return relativeRedirect("/admin?error=nautt-credentials-failed");
  }
}

import { getNauttCredentialService } from "@/auth/nautt-credential";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminFromCookie();
    const apiKey = (await request.formData()).get("apiKey");
    await getNauttCredentialService().save(actor, (await params).id, typeof apiKey === "string" ? apiKey : "");
    return relativeRedirect("/admin?success=nautt-credentials");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return relativeRedirect("/admin?error=nautt-credentials-failed");
  }
}

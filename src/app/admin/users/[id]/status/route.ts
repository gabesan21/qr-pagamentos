import { getAdministrationService } from "@/auth/administration";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminFromCookie();
    const status = (await request.formData()).get("status");
    if (status !== "ACTIVE" && status !== "DISABLED") throw new Error("Invalid status");
    await getAdministrationService().changeStatus(actor, (await params).id, status);
    return relativeRedirect("/admin?success=status");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return relativeRedirect("/admin?error=change-failed");
  }
}

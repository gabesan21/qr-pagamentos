import { getAdministrationService } from "@/auth/administration";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminFromCookie();
    const password = (await request.formData()).get("password");
    await getAdministrationService().changePassword(actor, (await params).id, typeof password === "string" ? password : "");
    return relativeRedirect("/admin?success=password");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return relativeRedirect("/admin?error=change-failed");
  }
}

import { getAdministrationService } from "@/auth/administration";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminFromCookie();
    const role = (await request.formData()).get("role");
    if (role !== "ADMIN" && role !== "USER") throw new Error("Invalid role");
    await getAdministrationService().changeRole(actor, (await params).id, role);
    return relativeRedirect("/admin?success=role");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return relativeRedirect("/admin?error=change-failed");
  }
}

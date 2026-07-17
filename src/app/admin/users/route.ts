import { getAdministrationService } from "@/auth/administration";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { relativeRedirect } from "@/app/relative-redirect";

function redirect(value: string) {
  return relativeRedirect(`/admin?${value}`);
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminFromCookie();
    const form = await request.formData();
    await getAdministrationService().createUser(actor, {
      username: String(form.get("username") ?? ""),
      email: typeof form.get("email") === "string" ? String(form.get("email")) : null,
      password: String(form.get("password") ?? ""),
      role: String(form.get("role") ?? ""),
    });
    return redirect("success=created");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return redirect("error=create-failed");
  }
}

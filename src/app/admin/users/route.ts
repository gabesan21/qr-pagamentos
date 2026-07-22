import { getAdministrationService } from "@/auth/administration";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

function redirect(value: string) {
  return relativeRedirect(`/admin?${value}`);
}

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminUsers }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
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
  });
}

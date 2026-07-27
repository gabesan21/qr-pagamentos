import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getSystemSettingsService } from "@/auth/system-settings";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminSettingsDefaultTheme }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireAdminFromCookie();
      const form = await request.formData();
      await getSystemSettingsService().saveDefaultTheme(actor, form.get("themeId"));
      return relativeRedirect("/admin/settings?success=theme-default");
    } catch (error) {
      const protectedResponse = protectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect("/admin/settings?error=theme-default-failed");
    }
  });
}

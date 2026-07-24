import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getProfileService, ProfileConflictError } from "@/auth/profile";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.profileIdentity }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const form = await request.formData();
      await getProfileService().updateIdentity(actor, {
        username: form.get("username"),
        email: form.get("email"),
        expectedVersion: form.get("expectedVersion"),
      });
      return relativeRedirect("/profile?identity=changed");
    } catch (error) {
      const protectedResponse = ownerProtectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect(error instanceof ProfileConflictError
        ? "/profile?identity=conflict"
        : "/profile?identity=failed");
    }
  });
}

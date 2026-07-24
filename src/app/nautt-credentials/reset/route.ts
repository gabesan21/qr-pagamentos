import { cookies } from "next/headers";

import { ForbiddenError, getAuthorizationService, UnauthenticatedError } from "@/auth/authorization";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getOwnerOnboardingService, OwnerOnboardingChangedError } from "@/integrations/nautt/owner-onboarding";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.nauttCredentialsReset }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const principal = await getAuthorizationService().requireUser((await cookies()).get("qr_session")?.value);
      await getOwnerOnboardingService().resetRegistration(principal);
      return relativeRedirect("/settings?nautt=reset");
    } catch (error) {
      if (error instanceof UnauthenticatedError) return new Response(null, { status: 401 });
      if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
      if (error instanceof OwnerOnboardingChangedError) return relativeRedirect("/settings?nautt=changed");
      return relativeRedirect("/settings?nautt=unavailable");
    }
  });
}

import { cookies } from "next/headers";

import { ForbiddenError, getAuthorizationService, UnauthenticatedError } from "@/auth/authorization";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { loadNauttWebhookCallbackUrl } from "@/integrations/nautt/config";
import {
  getOwnerOnboardingService,
  OwnerOnboardingChangedError,
  OwnerOnboardingInvalidKeyError,
  OwnerOnboardingRecoveryRequiredError,
} from "@/integrations/nautt/owner-onboarding";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.nauttCredentials }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const principal = await getAuthorizationService().requireUser((await cookies()).get("qr_session")?.value);
      const apiKey = (await request.formData()).get("apiKey");
      await getOwnerOnboardingService().onboard(
        principal,
        principal.id,
        typeof apiKey === "string" ? apiKey : "",
        loadNauttWebhookCallbackUrl(),
      );
      return relativeRedirect("/settings?nautt=configured#settings-connection");
    } catch (error) {
      if (error instanceof UnauthenticatedError) return new Response(null, { status: 401 });
      if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
      if (error instanceof OwnerOnboardingInvalidKeyError) return relativeRedirect("/settings?nautt=invalid#settings-connection");
      if (error instanceof OwnerOnboardingChangedError) return relativeRedirect("/settings?nautt=changed#settings-connection");
      if (error instanceof OwnerOnboardingRecoveryRequiredError) return relativeRedirect("/settings?nautt=recovery#settings-connection");
      return relativeRedirect("/settings?nautt=unavailable#settings-connection");
    }
  });
}

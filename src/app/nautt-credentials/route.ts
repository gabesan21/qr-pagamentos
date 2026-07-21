import { cookies } from "next/headers";

import { getAuthorizationService, UnauthenticatedError } from "@/auth/authorization";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { loadNauttWebhookCallbackUrl } from "@/integrations/nautt/config";
import {
  getOwnerOnboardingService,
  OwnerOnboardingChangedError,
  OwnerOnboardingInvalidKeyError,
  OwnerOnboardingRecoveryRequiredError,
} from "@/integrations/nautt/owner-onboarding";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  try {
    const principal = await getAuthorizationService().requireAuthenticated((await cookies()).get("qr_session")?.value);
    const apiKey = (await request.formData()).get("apiKey");
    await getOwnerOnboardingService().onboard(
      principal,
      principal.id,
      typeof apiKey === "string" ? apiKey : "",
      loadNauttWebhookCallbackUrl(),
    );
    return relativeRedirect("/?nautt=configured");
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response(null, { status: 401 });
    if (error instanceof OwnerOnboardingInvalidKeyError) return relativeRedirect("/?nautt=invalid");
    if (error instanceof OwnerOnboardingChangedError) return relativeRedirect("/?nautt=changed");
    if (error instanceof OwnerOnboardingRecoveryRequiredError) return relativeRedirect("/?nautt=recovery");
    return relativeRedirect("/?nautt=unavailable");
  }
}

import { cookies } from "next/headers";

import { getAuthorizationService, UnauthenticatedError } from "@/auth/authorization";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getOwnerOnboardingService, OwnerOnboardingChangedError } from "@/integrations/nautt/owner-onboarding";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  try {
    const principal = await getAuthorizationService().requireAuthenticated((await cookies()).get("qr_session")?.value);
    await getOwnerOnboardingService().resetRegistration(principal);
    return relativeRedirect("/?nautt=reset");
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new Response(null, { status: 401 });
    if (error instanceof OwnerOnboardingChangedError) return relativeRedirect("/?nautt=changed");
    return relativeRedirect("/?nautt=unavailable");
  }
}

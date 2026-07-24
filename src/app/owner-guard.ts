import { cookies } from "next/headers";

import { ForbiddenError, UnauthenticatedError, getAuthorizationService } from "@/auth/authorization";

export async function requireOwnerFromCookie() {
  return getAuthorizationService().requireUser((await cookies()).get("qr_session")?.value);
}

export function ownerProtectedMutationResponse(error: unknown) {
  if (error instanceof UnauthenticatedError) return new Response(null, { status: 401 });
  if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
  return null;
}

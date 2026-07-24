import { cookies } from "next/headers";

import { getAuthorizationService, UnauthenticatedError } from "@/auth/authorization";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminUserNauttCredentials }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      await getAuthorizationService().requireAuthenticated((await cookies()).get("qr_session")?.value);
      return new Response(null, { status: 403 });
    } catch (error) {
      if (error instanceof UnauthenticatedError) return new Response(null, { status: 401 });
      throw error;
    }
  });
}

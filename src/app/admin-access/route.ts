import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ForbiddenError, UnauthenticatedError, getAuthorizationService } from "../../auth/authorization";

export async function GET() {
  try {
    await getAuthorizationService().requireAdmin((await cookies()).get("qr_session")?.value);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new NextResponse(null, { status: 401 });
    if (error instanceof ForbiddenError) return new NextResponse(null, { status: 403 });
    throw error;
  }
}

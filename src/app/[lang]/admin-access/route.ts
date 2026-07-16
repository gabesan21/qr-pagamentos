import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ForbiddenError, UnauthenticatedError, getAuthorizationService } from "../../../auth/authorization";
import { isSupportedLocale } from "../../../i18n/locales";

export async function GET(_request: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isSupportedLocale(lang)) return new NextResponse(null, { status: 404 });
  try {
    await getAuthorizationService().requireAdmin((await cookies()).get("qr_session")?.value);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof UnauthenticatedError) return new NextResponse(null, { status: 401 });
    if (error instanceof ForbiddenError) return new NextResponse(null, { status: 403 });
    throw error;
  }
}

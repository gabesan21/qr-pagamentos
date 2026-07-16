import { NextResponse } from "next/server";

import { getAdministrationService } from "@/auth/administration";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminFromCookie();
    const password = (await request.formData()).get("password");
    await getAdministrationService().changePassword(actor, (await params).id, typeof password === "string" ? password : "");
    return NextResponse.redirect(new URL("/admin?success=password", request.url), { status: 303 });
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return NextResponse.redirect(new URL("/admin?error=change-failed", request.url), { status: 303 });
  }
}

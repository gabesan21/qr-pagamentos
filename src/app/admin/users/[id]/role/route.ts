import { NextResponse } from "next/server";

import { getAdministrationService } from "@/auth/administration";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminFromCookie();
    const role = (await request.formData()).get("role");
    if (role !== "ADMIN" && role !== "USER") throw new Error("Invalid role");
    await getAdministrationService().changeRole(actor, (await params).id, role);
    return NextResponse.redirect(new URL("/admin?success=role", request.url), { status: 303 });
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return NextResponse.redirect(new URL("/admin?error=change-failed", request.url), { status: 303 });
  }
}

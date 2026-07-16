import { NextResponse } from "next/server";

import { getAdministrationService } from "@/auth/administration";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdminFromCookie();
    const status = (await request.formData()).get("status");
    if (status !== "ACTIVE" && status !== "DISABLED") throw new Error("Invalid status");
    await getAdministrationService().changeStatus(actor, (await params).id, status);
    return NextResponse.redirect(new URL("/admin?success=status", request.url), { status: 303 });
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return NextResponse.redirect(new URL("/admin?error=change-failed", request.url), { status: 303 });
  }
}

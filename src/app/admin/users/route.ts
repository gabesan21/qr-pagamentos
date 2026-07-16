import { NextResponse } from "next/server";

import { getAdministrationService } from "@/auth/administration";
import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";

function redirect(request: Request, value: string) {
  return NextResponse.redirect(new URL(`/admin?${value}`, request.url), { status: 303 });
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminFromCookie();
    const form = await request.formData();
    await getAdministrationService().createUser(actor, {
      username: String(form.get("username") ?? ""),
      email: typeof form.get("email") === "string" ? String(form.get("email")) : null,
      password: String(form.get("password") ?? ""),
      role: String(form.get("role") ?? ""),
    });
    return redirect(request, "success=created");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return redirect(request, "error=create-failed");
  }
}

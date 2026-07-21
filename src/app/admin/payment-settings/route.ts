import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { getPaymentSettingsService, SUPPORTED_CURRENCIES, SUPPORTED_PAYMENT_METHODS } from "@/auth/payment-settings";
import { relativeRedirect } from "@/app/relative-redirect";

function selected(form: FormData, field: string, allowed: readonly string[]) {
  const values = form.getAll(field).filter((value): value is string => typeof value === "string");
  if (values.some((value) => !allowed.includes(value))) throw new Error("Unsupported payment setting");
  return values;
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  try {
    const actor = await requireAdminFromCookie();
    const form = await request.formData();
    await getPaymentSettingsService().save(actor, {
      currencies: selected(form, "currencies", SUPPORTED_CURRENCIES),
      paymentMethods: selected(form, "paymentMethods", SUPPORTED_PAYMENT_METHODS),
    });
    return relativeRedirect("/admin?success=settings");
  } catch (error) {
    const protectedResponse = protectedMutationResponse(error);
    if (protectedResponse) return protectedResponse;
    return relativeRedirect("/admin?error=settings-failed");
  }
}

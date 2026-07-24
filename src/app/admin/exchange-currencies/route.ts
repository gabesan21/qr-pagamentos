import { protectedMutationResponse, requireAdminFromCookie } from "@/app/admin/guard";
import { rejectCrossOrigin } from "@/app/origin-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

function mappingFrom(form: FormData) {
  return {
    code: form.get("code"),
    label: form.get("label"),
    currencyUuid: form.get("currencyUuid"),
    exchangeCurrencyUuid: form.get("exchangeCurrencyUuid"),
  };
}

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.adminExchangeCurrencies }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireAdminFromCookie();
      const form = await request.formData();
      const service = getSupportedExchangeCurrencyService();
      const intent = form.get("intent");
      if (intent === "register") {
        await service.register(actor, mappingFrom(form));
      } else if (intent === "replace") {
        await service.replace(actor, mappingFrom(form));
      } else if (intent === "deactivate") {
        await service.deactivate(actor, form.get("code"));
      } else {
        throw new Error("Unsupported exchange currency intent");
      }
      return relativeRedirect("/admin?success=exchange-currency");
    } catch (error) {
      const protectedResponse = protectedMutationResponse(error);
      if (protectedResponse) return protectedResponse;
      return relativeRedirect("/admin?error=exchange-currency-failed");
    }
  });
}

import { rejectCrossOrigin } from "@/app/origin-guard";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "@/app/owner-guard";
import { relativeRedirect } from "@/app/relative-redirect";
import { getCheckoutPolicyService } from "@/auth/checkout-policy";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.checkoutPolicy }, async () => {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) return crossOrigin;
    try {
      const actor = await requireOwnerFromCookie();
      const policy = (await request.formData()).get("checkoutDataPolicy");
      await getCheckoutPolicyService().update(actor, policy);
      return relativeRedirect("/?checkout-policy=changed");
    } catch (error) {
      return ownerProtectedMutationResponse(error) ?? relativeRedirect("/?checkout-policy=failed");
    }
  });
}

import { getPublicPaymentLinkV2Service } from "@/auth/public-payment-link-v2";
import { negotiateLocale } from "@/i18n/locales";
import {
  allowPublicPaymentLinkRequest,
  publicPaymentLinkRateLimitSurface,
  publicRateLimitResponse,
} from "@/security/public-rate-limit";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  { params }: Readonly<{ params: Promise<{ identifier: string }> }>,
) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "GET", route: serverRequestRoutes.publicPaymentLink }, async () => {
    if (!allowPublicPaymentLinkRequest(request, publicPaymentLinkRateLimitSurface.read)) {
      return publicRateLimitResponse();
    }

    const locale = negotiateLocale(request.headers.get("accept-language"));
    const paymentLinkV2 = await getPublicPaymentLinkV2Service().read((await params).identifier, locale);
    if (!paymentLinkV2) return new Response(null, { status: 404, headers: noStoreHeaders });
    return Response.json(paymentLinkV2, { status: 200, headers: noStoreHeaders });
  });
}

import { getPublicPaymentLinkService } from "@/auth/public-payment-link";
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

    const paymentLink = await getPublicPaymentLinkService().read(
      (await params).identifier,
      negotiateLocale(request.headers.get("accept-language")),
    );

    if (!paymentLink) return new Response(null, { status: 404, headers: noStoreHeaders });
    return Response.json(paymentLink, { status: 200, headers: noStoreHeaders });
  });
}

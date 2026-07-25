import { getPublicPaymentLinkService } from "@/auth/public-payment-link";
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
    // V1 first: a V1 identifier never returns a V2-shaped payload; V2
    // resolution is additive and unreachable while any V1 link resolves.
    const paymentLink = await getPublicPaymentLinkService().read((await params).identifier, locale);
    if (paymentLink) return Response.json(paymentLink, { status: 200, headers: noStoreHeaders });

    const paymentLinkV2 = await getPublicPaymentLinkV2Service().read((await params).identifier, locale);
    if (!paymentLinkV2) return new Response(null, { status: 404, headers: noStoreHeaders });
    return Response.json(paymentLinkV2, { status: 200, headers: noStoreHeaders });
  });
}

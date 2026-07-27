import { getPublicPaymentStatusService } from "@/checkout/payment-status";
import { getPublicPaymentStatusV2Service } from "@/checkout/payment-status-v2";
import {
  allowPublicPaymentLinkRequest,
  publicPaymentLinkRateLimitSurface,
  publicRateLimitResponse,
} from "@/security/public-rate-limit";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.publicCheckoutStatus }, async () => {
    if (!allowPublicPaymentLinkRequest(request, publicPaymentLinkRateLimitSurface.status)) {
      return publicRateLimitResponse();
    }

    let body: unknown;
    try { body = await request.json(); } catch { return new Response(null, { status: 400, headers: noStoreHeaders }); }
    const statusCapability = body && typeof body === "object" && !Array.isArray(body)
      && Object.keys(body).length === 1 && "statusCapability" in body
      ? (body as { statusCapability?: unknown }).statusCapability
      : null;
    // V1 first: a V1 capability never reaches the additive V2 branch; only a
    // V1 miss falls through to the V2 capability read, sharing the one opaque
    // 404 outcome.
    const payment = await getPublicPaymentStatusService().read(statusCapability) ?? await getPublicPaymentStatusV2Service().read(statusCapability);
    if (!payment) return new Response(null, { status: 404, headers: noStoreHeaders });
    return Response.json({ payment }, { status: 200, headers: noStoreHeaders });
  });
}

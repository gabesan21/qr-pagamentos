import { getPublicPaymentStatusService } from "@/checkout/payment-status";
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
    const payment = await getPublicPaymentStatusService().read(statusCapability);
    if (!payment) return new Response(null, { status: 404, headers: noStoreHeaders });
    return Response.json({ payment }, { status: 200, headers: noStoreHeaders });
  });
}

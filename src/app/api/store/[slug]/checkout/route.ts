import { getStandaloneCheckoutService } from "@/checkout/standalone-checkout";
import {
  allowPublicPaymentLinkRequest,
  publicPaymentLinkRateLimitSurface,
  publicRateLimitResponse,
} from "@/security/public-rate-limit";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.standaloneCheckout }, async () => {
    if (!allowPublicPaymentLinkRequest(request, publicPaymentLinkRateLimitSurface.standaloneCheckout)) {
      return publicRateLimitResponse();
    }

    let body: unknown;
    try { body = await request.json(); } catch { return new Response(null, { status: 400, headers: noStoreHeaders }); }
    const result = await getStandaloneCheckoutService().checkout((await params).slug, body);
    if (result.kind === "invalid") return new Response(null, { status: 400, headers: noStoreHeaders });
    if (result.kind === "unavailable") return new Response(null, { status: 404, headers: noStoreHeaders });
    if (result.kind === "provider-unavailable") return new Response(null, { status: 503, headers: noStoreHeaders });
    return Response.json({ payment: result.payment, statusCapability: result.statusCapability }, { status: result.status, headers: noStoreHeaders });
  });
}

import { getPublicCheckoutService } from "@/checkout/public-checkout";
import { getPublicCheckoutV2Service, type PublicCheckoutV2Result } from "@/checkout/public-checkout-v2";
import {
  allowPublicPaymentLinkRequest,
  publicPaymentLinkRateLimitSurface,
  publicRateLimitResponse,
} from "@/security/public-rate-limit";
import { serverRequestRoutes, withServerRequestLog } from "@/observability/server-request-log";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: Readonly<{ params: Promise<{ identifier: string }> }>) {
  return withServerRequestLog(request.headers.get("x-request-id"), { method: "POST", route: serverRequestRoutes.publicCheckout }, async () => {
    if (!allowPublicPaymentLinkRequest(request, publicPaymentLinkRateLimitSurface.checkout)) {
      return publicRateLimitResponse();
    }

    let body: unknown;
    try { body = await request.json(); } catch { return new Response(null, { status: 400, headers: noStoreHeaders }); }
    const identifier = (await params).identifier;
    // V1 first: a V1 identifier never reaches the additive V2 branch; only the
    // opaque V1 unavailable outcome falls through to V2 resolution, which
    // shares the same closed outcome matrix.
    let result: PublicCheckoutV2Result = await getPublicCheckoutService().checkout(identifier, body);
    if (result.kind === "unavailable") result = await getPublicCheckoutV2Service().checkout(identifier, body);
    if (result.kind === "invalid") return new Response(null, { status: 400, headers: noStoreHeaders });
    if (result.kind === "unavailable") return new Response(null, { status: 404, headers: noStoreHeaders });
    if (result.kind === "provider-unavailable") return new Response(null, { status: 503, headers: noStoreHeaders });
    return Response.json({ payment: result.payment, statusCapability: result.statusCapability }, { status: result.status, headers: noStoreHeaders });
  });
}

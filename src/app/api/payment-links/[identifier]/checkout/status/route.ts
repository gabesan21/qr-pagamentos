import { getPublicPaymentStatusService } from "@/checkout/payment-status";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return new Response(null, { status: 400, headers: noStoreHeaders }); }
  const statusCapability = body && typeof body === "object" && !Array.isArray(body)
    && Object.keys(body).length === 1 && "statusCapability" in body
    ? (body as { statusCapability?: unknown }).statusCapability
    : null;
  const payment = await getPublicPaymentStatusService().read(statusCapability);
  if (!payment) return new Response(null, { status: 404, headers: noStoreHeaders });
  return Response.json({ payment }, { status: 200, headers: noStoreHeaders });
}

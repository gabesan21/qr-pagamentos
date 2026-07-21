import { getPublicPaymentLinkService } from "@/auth/public-payment-link";
import { negotiateLocale } from "@/i18n/locales";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  { params }: Readonly<{ params: Promise<{ identifier: string }> }>,
) {
  const paymentLink = await getPublicPaymentLinkService().read(
    (await params).identifier,
    negotiateLocale(request.headers.get("accept-language")),
  );

  if (!paymentLink) return new Response(null, { status: 404, headers: noStoreHeaders });
  return Response.json(paymentLink, { status: 200, headers: noStoreHeaders });
}

import { headers } from "next/headers";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicCheckoutPresentationService } from "@/checkout/public-checkout-presentation";
import { getDictionary } from "@/i18n/dictionaries";
import { negotiateLocale } from "@/i18n/locales";

import { PublicCheckoutForm } from "./public-checkout-form";

export const dynamic = "force-dynamic";

export default async function PublicCheckoutPage({ params }: Readonly<{ params: Promise<{ identifier: string }> }>) {
  const locale = negotiateLocale((await headers()).get("accept-language"));
  const dictionary = getDictionary(locale);
  const identifier = (await params).identifier;
  const presentation = await getPublicCheckoutPresentationService().read(identifier, locale);
  if (!presentation) return <main className="checkout-shell"><Card className="checkout-card"><CardHeader><CardTitle>{dictionary.checkoutUnavailableHeading}</CardTitle></CardHeader><CardContent><Alert variant="warning"><AlertTitle>{dictionary.checkoutUnavailableHeading}</AlertTitle><AlertDescription>{dictionary.checkoutUnavailableDescription}</AlertDescription></Alert></CardContent></Card></main>;
  return <main className="checkout-shell"><header className="receipt-rail"><span className="receipt-rail__label">QR Pagamentos</span><h1>{presentation.product.title}</h1><p className="checkout-description">{presentation.product.description}</p><div className="receipt-rail__facts"><span>{dictionary.checkoutPriceLabel}: {presentation.product.price}</span></div></header><PublicCheckoutForm dictionary={dictionary} identifier={identifier} policy={presentation.checkoutPolicy} /></main>;
}

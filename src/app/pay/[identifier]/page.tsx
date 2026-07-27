import { cookies } from "next/headers";

import { getAuthorizationService } from "@/auth/authorization";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicCheckoutPresentationService } from "@/checkout/public-checkout-presentation";
import { getPublicCheckoutV2PresentationService } from "@/checkout/public-checkout-v2-presentation";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { defaultLocale } from "@/i18n/locales";

import { PublicCheckoutForm } from "./public-checkout-form";
import { PublicCheckoutV2Page, PublicCheckoutV2PaidPage } from "./public-checkout-v2-page";

export const dynamic = "force-dynamic";

export default async function PublicCheckoutPage({ params }: Readonly<{ params: Promise<{ identifier: string }> }>) {
  const token = (await cookies()).get("qr_session")?.value;
  const principal = token ? await getAuthorizationService().resolve(token) : null;
  const locale = principal ? await getLocalePreferenceService().resolve(principal.id) : defaultLocale;
  const dictionary = getDictionary(locale);
  const identifier = (await params).identifier;
  // V1 first: a V1 identifier renders through the untouched V1 path; only a
  // V1 miss resolves the additive Commerce V2 presentation — the checkout
  // view, the 9.3.2 paid terminal view for a consumed single-use link, or
  // the one opaque unavailable view covering every other outcome.
  const presentation = await getPublicCheckoutPresentationService().read(identifier, locale);
  if (presentation) return <main className="checkout-shell"><header className="receipt-rail"><span className="receipt-rail__label">QR Pagamentos</span><h1>{presentation.product.title}</h1><p className="checkout-description">{presentation.product.description}</p><div className="receipt-rail__facts"><span>{dictionary.checkoutPriceLabel}: {presentation.product.price}</span></div></header><PublicCheckoutForm dictionary={dictionary} identifier={identifier} policy={presentation.checkoutPolicy} /></main>;
  const outcomeV2 = await getPublicCheckoutV2PresentationService().read(identifier, locale);
  if (!outcomeV2) return <main className="checkout-shell"><Card className="checkout-card"><CardHeader><CardTitle>{dictionary.checkoutUnavailableHeading}</CardTitle></CardHeader><CardContent><Alert variant="warning"><AlertTitle>{dictionary.checkoutUnavailableHeading}</AlertTitle><AlertDescription>{dictionary.checkoutUnavailableDescription}</AlertDescription></Alert></CardContent></Card></main>;
  if (outcomeV2.kind === "paid") return <PublicCheckoutV2PaidPage dictionary={dictionary} presentation={outcomeV2.paid} />;
  return <PublicCheckoutV2Page dictionary={dictionary} identifier={identifier} presentation={outcomeV2.presentation} />;
}

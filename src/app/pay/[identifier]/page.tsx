import { cookies } from "next/headers";

import { getAuthorizationService } from "@/auth/authorization";
import { EmptyState } from "@/components/ui/empty-state";
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
  if (presentation) {
    return (
      <main className="checkout-shell">
        <div className="checkout-main">
          <PublicCheckoutForm
            dictionary={dictionary}
            identifier={identifier}
            policy={presentation.checkoutPolicy}
            product={presentation.product}
          />
        </div>
      </main>
    );
  }

  const outcomeV2 = await getPublicCheckoutV2PresentationService().read(identifier, locale);
  if (!outcomeV2) {
    return (
      <main className="checkout-shell">
        <div className="checkout-main">
          <EmptyState
            body={dictionary.checkoutUnavailableDescription}
            kind="unavailable"
            title={dictionary.checkoutUnavailableHeading}
          />
        </div>
      </main>
    );
  }

  if (outcomeV2.kind === "paid") {
    return <PublicCheckoutV2PaidPage dictionary={dictionary} presentation={outcomeV2.paid} />;
  }

  return <PublicCheckoutV2Page dictionary={dictionary} identifier={identifier} presentation={outcomeV2.presentation} />;
}

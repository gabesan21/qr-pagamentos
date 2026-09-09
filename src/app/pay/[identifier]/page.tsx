import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { getAuthorizationService } from "@/auth/authorization";
import { EmptyState } from "@/components/ui/empty-state";
import { Monogram } from "@/components/ui/monogram";
import { BrandIdentity } from "@/brand/brand-identity";
import { getPublicCheckoutPresentationService, type PublicCheckoutBranding } from "@/checkout/public-checkout-presentation";
import { getPublicCheckoutV2PresentationService } from "@/checkout/public-checkout-v2-presentation";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";

import { CheckoutShell } from "./checkout-shell";
import { PublicCheckoutForm } from "./public-checkout-form";
import { PublicCheckoutV2Page, PublicCheckoutV2PaidPage } from "./public-checkout-v2-page";

export const dynamic = "force-dynamic";

type Dictionary = ReturnType<typeof getDictionary>;

// The QR centre-cut merchant mark (14.6.1 round-1 repair, C06): the same
// logo/`Monogram`/fallback precedence `CheckoutMerchantHeader` renders for the
// header, sized for `QrDisplay`'s `identity` slot instead of the page header.
function merchantIdentityMark(branding: PublicCheckoutBranding, dictionary: Dictionary): ReactNode {
  if (branding.logoMediaIdentifier) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={dictionary.checkoutMerchantLogoAlt} className="size-7 object-contain" src={`/media/${branding.logoMediaIdentifier}`} />
    );
  }
  if (branding.displayName) return <Monogram name={branding.displayName} size="sm" />;
  return <span aria-label={dictionary.checkoutMerchantFallbackAlt} role="img"><BrandIdentity variant="merchant-fallback" /></span>;
}

export default async function PublicCheckoutPage({ params }: Readonly<{ params: Promise<{ identifier: string }> }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("qr_session")?.value;
  const principal = token ? await getAuthorizationService().resolve(token) : null;
  const locale = principal
    ? await getLocalePreferenceService().resolve(principal.id)
    : localeFromPreferenceCookie(cookieStore.get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);
  const identifier = (await params).identifier;

  // V1 first: a V1 identifier renders through the untouched V1 path; only a
  // V1 miss resolves the additive Commerce V2 presentation — the checkout
  // view, the 9.3.2 paid terminal view for a consumed single-use link, or
  // the one opaque unavailable view covering every other outcome.
  const presentation = await getPublicCheckoutPresentationService().read(identifier, locale);
  if (presentation) {
    return (
      <CheckoutShell branding={presentation.branding} dictionary={dictionary} locale={locale}>
        <PublicCheckoutForm
          dictionary={dictionary}
          identifier={identifier}
          merchantIdentity={merchantIdentityMark(presentation.branding, dictionary)}
          policy={presentation.checkoutPolicy}
          product={presentation.product}
        />
      </CheckoutShell>
    );
  }

  const outcomeV2 = await getPublicCheckoutV2PresentationService().read(identifier, locale);
  if (!outcomeV2) {
    return (
      <CheckoutShell dictionary={dictionary} locale={locale}>
        <EmptyState
          body={dictionary.checkoutUnavailableDescription}
          kind="unavailable"
          title={dictionary.checkoutUnavailableHeading}
        />
      </CheckoutShell>
    );
  }

  if (outcomeV2.kind === "paid") {
    return <PublicCheckoutV2PaidPage dictionary={dictionary} locale={locale} presentation={outcomeV2.paid} />;
  }

  return <PublicCheckoutV2Page dictionary={dictionary} identifier={identifier} locale={locale} presentation={outcomeV2.presentation} />;
}

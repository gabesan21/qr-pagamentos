import type { CSSProperties } from "react";

import { cookies } from "next/headers";

import { getAuthorizationService } from "@/auth/authorization";
import { BrandIdentity } from "@/brand/brand-identity";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { defaultLocale } from "@/i18n/locales";
import { getPublicStorefrontService } from "@/storefront/public-storefront";

import { StandalonePaymentExperience, StandalonePaymentUnavailable } from "./standalone-payment-experience";

export const dynamic = "force-dynamic";

// Sessionless standalone payment page (9.2.2): the buyer experience on top of
// 9.2.1's routes. The page mirrors the storefront theme/branding exactly and
// renders the one opaque unavailable view whenever the projection cannot
// resolve or standalone payments are off — the same null-projection outcome,
// never a distinguished reason. The ?amount= query is prefill only: the
// client revalidates it against the canonical amount grammar and 9.2.1
// validates it again server-side.
export default async function StandalonePaymentPage({ params, searchParams }: Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<{ amount?: string | string[] }> }>) {
  const token = (await cookies()).get("qr_session")?.value;
  const principal = token ? await getAuthorizationService().resolve(token) : null;
  const locale = principal ? await getLocalePreferenceService().resolve(principal.id) : defaultLocale;
  const dictionary = getDictionary(locale);
  const slug = (await params).slug;
  const storefront = await getPublicStorefrontService().read(slug, locale);

  if (!storefront || !storefront.standalonePayments) {
    return (
      <main className="storefront-shell storefront-shell--unavailable">
        <StandalonePaymentUnavailable dictionary={dictionary} slug={slug} />
      </main>
    );
  }

  const query = (await searchParams).amount;
  const prefillAmount = typeof query === "string" ? query : null;
  const displayName = storefront.displayName ?? dictionary.storefrontFallbackName;
  return (
    <main className="storefront-shell" data-theme-preview={storefront.themeId} style={{ "--storefront-accent": storefront.accentColor } as CSSProperties}>
      <header className="receipt-rail storefront-rail">
        {storefront.logoMediaIdentifier
          ? <img alt={dictionary.storefrontLogoAlt} className="storefront-logo" src={`/media/${storefront.logoMediaIdentifier}`} />
          : <BrandIdentity variant="merchant-fallback" />}
        <h1 className="storefront-heading">{displayName}</h1>
        <p className="storefront-introduction">{dictionary.storefrontPayIntroduction}</p>
      </header>
      <StandalonePaymentExperience
        currencyCode={storefront.standalonePaymentCurrencyCode}
        dictionary={dictionary}
        policy={storefront.checkoutDataPolicy}
        prefillAmount={prefillAmount}
        slug={slug}
      />
    </main>
  );
}

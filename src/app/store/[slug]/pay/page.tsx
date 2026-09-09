import { cookies } from "next/headers";

import { getAuthorizationService } from "@/auth/authorization";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";
import { getPublicStorefrontService } from "@/storefront/public-storefront";

import { CheckoutShell } from "@/app/pay/[identifier]/checkout-shell";

import { StandalonePaymentExperience, StandalonePaymentUnavailable } from "./standalone-payment-experience";

export const dynamic = "force-dynamic";

// Sessionless standalone payment page (9.2.2), converged (14.6.2 F02): the
// buyer experience reuses 14.6.1's branded shell — merchant header (logo or
// `Monogram`, display name, trust line), the `--storefront-accent`/
// `data-theme-preview` mechanism, and the public footer — instead of a
// page-local rail. The page renders the one opaque unavailable view whenever
// the projection cannot resolve or standalone payments are off — the same
// null-projection outcome, never a distinguished reason. The `?amount=` query
// is prefill only: the client revalidates it against the canonical amount
// grammar and 9.2.1 validates it again server-side.
export default async function StandalonePaymentPage({ params, searchParams }: Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<{ amount?: string | string[] }> }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("qr_session")?.value;
  const principal = token ? await getAuthorizationService().resolve(token) : null;
  const locale = principal
    ? await getLocalePreferenceService().resolve(principal.id)
    : localeFromPreferenceCookie(cookieStore.get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);
  const slug = (await params).slug;
  const storefront = await getPublicStorefrontService().read(slug, locale);

  if (!storefront || !storefront.standalonePayments) {
    return (
      <CheckoutShell dictionary={dictionary} locale={locale}>
        <StandalonePaymentUnavailable dictionary={dictionary} slug={slug} />
      </CheckoutShell>
    );
  }

  const query = (await searchParams).amount;
  const prefillAmount = typeof query === "string" ? query : null;

  return (
    <CheckoutShell branding={storefront} dictionary={dictionary} locale={locale}>
      <StandalonePaymentExperience
        currencyCode={storefront.standalonePaymentCurrencyCode}
        dictionary={dictionary}
        policy={storefront.checkoutDataPolicy}
        prefillAmount={prefillAmount}
        slug={slug}
      />
    </CheckoutShell>
  );
}

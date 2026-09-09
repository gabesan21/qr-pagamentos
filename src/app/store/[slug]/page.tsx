import { cookies } from "next/headers";
import Link from "next/link";

import { getAuthorizationService } from "@/auth/authorization";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";
import { getPublicStorefrontService } from "@/storefront/public-storefront";

import { CheckoutShell } from "@/app/pay/[identifier]/checkout-shell";

import { StorefrontExperience } from "./storefront-experience";

export const dynamic = "force-dynamic";

// Converged (14.6.2 F01): the storefront reuses 14.6.1's branded shell —
// merchant header (logo or `Monogram`, display name, trust line), the
// `--storefront-accent`/`data-theme-preview` mechanism, and the public
// footer with `LanguageSwitcher` — instead of a page-local rail and footer.
export default async function PublicStorefrontPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("qr_session")?.value;
  const principal = token ? await getAuthorizationService().resolve(token) : null;
  const locale = principal
    ? await getLocalePreferenceService().resolve(principal.id)
    : localeFromPreferenceCookie(cookieStore.get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);
  const slug = (await params).slug;
  const storefront = await getPublicStorefrontService().read(slug, locale);

  if (!storefront) {
    return (
      <CheckoutShell dictionary={dictionary} locale={locale}>
        <EmptyState
          body={dictionary.storefrontUnavailableDescription}
          illustration="unavailable"
          kind="unavailable"
          title={dictionary.storefrontUnavailableHeading}
        />
      </CheckoutShell>
    );
  }

  const isEmpty = storefront.catalog.length === 0 && !storefront.standalonePayments;

  return (
    <CheckoutShell branding={storefront} dictionary={dictionary} locale={locale}>
      {isEmpty ? (
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link href="/">{dictionary.storefrontErrorRetry}</Link>
            </Button>
          }
          body={dictionary.storefrontEmptyDescription}
          illustration="products"
          kind="empty"
          title={dictionary.storefrontEmptyHeading}
        />
      ) : (
        <StorefrontExperience
          catalog={storefront.catalog}
          copy={{
            cartCheckout: dictionary.storefrontCartCheckout,
            cartCheckoutFailed: dictionary.storefrontCartCheckoutFailed,
            cartEmpty: dictionary.storefrontCartEmpty,
            cartHeading: dictionary.storefrontCartHeading,
            cartRemove: dictionary.storefrontCartRemove,
            cartTotalLabel: dictionary.storefrontCartTotalLabel,
            cartUpdated: dictionary.storefrontCartUpdated,
            customAmountAdd: dictionary.storefrontCustomAmountAdd,
            customAmountDescription: dictionary.storefrontCustomAmountDescription,
            customAmountInvalid: dictionary.storefrontCustomAmountInvalid,
            customAmountLabel: dictionary.storefrontCustomAmountLabel,
            customAmountPay: dictionary.storefrontCustomAmountPay,
            customAmountTitle: dictionary.storefrontCustomAmountTitle,
            customAmountUpdate: dictionary.storefrontCustomAmountUpdate,
            decreaseQuantity: dictionary.storefrontDecreaseQuantity,
            groupUncategorized: dictionary.storefrontGroupUncategorized,
            increaseQuantity: dictionary.storefrontIncreaseQuantity,
            priceLabel: dictionary.storefrontPriceLabel,
            productsHeading: dictionary.storefrontProductsHeading,
            quantityLabel: dictionary.storefrontQuantityLabel,
          }}
          layout={storefront.layout}
          slug={slug}
          standalonePaymentCurrencyCode={storefront.standalonePaymentCurrencyCode}
          standalonePayments={storefront.standalonePayments}
        />
      )}
    </CheckoutShell>
  );
}

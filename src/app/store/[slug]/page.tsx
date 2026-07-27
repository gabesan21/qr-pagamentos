import type { CSSProperties } from "react";

import { cookies } from "next/headers";

import { getAuthorizationService } from "@/auth/authorization";
import { BrandIdentity } from "@/brand/brand-identity";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";
import { defaultLocale } from "@/i18n/locales";
import { getPublicStorefrontService } from "@/storefront/public-storefront";

import { StorefrontExperience } from "./storefront-experience";

export const dynamic = "force-dynamic";

export default async function PublicStorefrontPage({ params }: Readonly<{ params: Promise<{ slug: string }> }>) {
  const token = (await cookies()).get("qr_session")?.value;
  const principal = token ? await getAuthorizationService().resolve(token) : null;
  const locale = principal ? await getLocalePreferenceService().resolve(principal.id) : defaultLocale;
  const dictionary = getDictionary(locale);
  const slug = (await params).slug;
  const storefront = await getPublicStorefrontService().read(slug, locale);

  if (!storefront) {
    return (
      <main className="storefront-shell storefront-shell--unavailable">
        <Card className="storefront-card">
          <CardHeader><CardTitle>{dictionary.storefrontUnavailableHeading}</CardTitle></CardHeader>
          <CardContent><Alert variant="destructive"><AlertTitle>{dictionary.storefrontUnavailableHeading}</AlertTitle><AlertDescription>{dictionary.storefrontUnavailableDescription}</AlertDescription></Alert></CardContent>
        </Card>
      </main>
    );
  }

  const displayName = storefront.displayName ?? dictionary.storefrontFallbackName;
  return (
    <main className="storefront-shell" data-theme-preview={storefront.themeId} style={{ "--storefront-accent": storefront.accentColor } as CSSProperties}>
      <header className="receipt-rail storefront-rail">
        {storefront.logoMediaIdentifier
          ? <img alt={dictionary.storefrontLogoAlt} className="storefront-logo" src={`/media/${storefront.logoMediaIdentifier}`} />
          : <BrandIdentity variant="merchant-fallback" />}
        <h1 className="storefront-heading">{displayName}</h1>
        <p className="storefront-introduction">{dictionary.storefrontIntroduction}</p>
      </header>
      {storefront.catalog.length === 0 && !storefront.standalonePayments ? (
        <Card className="storefront-card">
          <CardHeader><CardTitle>{dictionary.storefrontEmptyHeading}</CardTitle><CardDescription>{dictionary.storefrontEmptyDescription}</CardDescription></CardHeader>
        </Card>
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
    </main>
  );
}

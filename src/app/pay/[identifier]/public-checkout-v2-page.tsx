import type { CSSProperties } from "react";

import { BrandIdentity } from "@/brand/brand-identity";
import { Separator } from "@/components/ui/separator";
import type { PublicCheckoutV2Presentation } from "@/checkout/public-checkout-v2-presentation";
import type { getDictionary } from "@/i18n/dictionaries";

import { PublicCheckoutV2Form } from "./public-checkout-v2-form";

type Dictionary = ReturnType<typeof getDictionary>;

// The branded two-column Commerce V2 checkout composition (9.3.1): the scoped
// data-theme-preview selector and the validated --storefront-accent
// declaration recolor the page root through the delivered storefront
// mechanism, while the summary column renders only server-derived facts
// (localized lines or fixed description, the seam-derived exact total, and
// the registry display code or the explicit unlabeled treatment).
export function PublicCheckoutV2Page({ dictionary, identifier, presentation }: Readonly<{ dictionary: Dictionary; identifier: string; presentation: PublicCheckoutV2Presentation }>) {
  const displayName = presentation.branding.displayName ?? dictionary.storefrontFallbackName;
  const total = presentation.composition.kind === "PRODUCT_LINES" ? presentation.composition.total : presentation.composition.amount;
  return (
    <main className="checkout-shell checkout-v2" data-theme-preview={presentation.branding.themeId} style={{ "--storefront-accent": presentation.branding.accentColor } as CSSProperties}>
      <header className="receipt-rail checkout-v2__rail">
        {presentation.branding.logoMediaIdentifier
          // The owner-activated public media object renders directly; the
          // official merchant fallback stays the only placeholder identity.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img alt={dictionary.checkoutMerchantLogoAlt} className="checkout-v2__logo" src={`/media/${presentation.branding.logoMediaIdentifier}`} />
          : <span aria-label={dictionary.checkoutMerchantFallbackAlt} role="img"><BrandIdentity variant="merchant-fallback" /></span>}
        <h1 className="checkout-v2__name">{displayName}</h1>
      </header>
      <div className="checkout-v2__columns">
        <section aria-label={dictionary.checkoutSummaryHeading} className="checkout-v2__summary">
          <h2 className="checkout-v2__heading">{dictionary.checkoutSummaryHeading}</h2>
          {presentation.composition.kind === "PRODUCT_LINES" ? (
            <ul className="checkout-v2__lines">
              {presentation.composition.lines.map((line, index) => (
                <li className="checkout-v2__line" key={`${index}-${line.product.title}`}>
                  <p className="checkout-v2__line-title">{line.product.title}</p>
                  <p className="checkout-v2__line-description">{line.product.description}</p>
                  <p className="checkout-v2__line-price">{line.quantity} × {line.product.price}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="checkout-v2__line-description">{presentation.composition.description}</p>
          )}
          <Separator />
          <p className="checkout-v2__total"><span>{dictionary.checkoutTotalLabel}</span> {total} {presentation.currencyCode ?? dictionary.checkoutUnlabeledCurrency}</p>
        </section>
        <PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy={presentation.checkoutPolicy} />
      </div>
    </main>
  );
}

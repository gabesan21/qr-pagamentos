import type { CSSProperties, ReactNode } from "react";

import { CheckCircle2Icon } from "lucide-react";

import { BrandIdentity } from "@/brand/brand-identity";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { PublicCheckoutV2Branding, PublicCheckoutV2Composition, PublicCheckoutV2PaidPresentation, PublicCheckoutV2Presentation } from "@/checkout/public-checkout-v2-presentation";
import type { getDictionary } from "@/i18n/dictionaries";

import { PublicCheckoutV2Form } from "./public-checkout-v2-form";

type Dictionary = ReturnType<typeof getDictionary>;

// The branded Commerce V2 shell (9.3.1): the scoped data-theme-preview
// selector and the validated --storefront-accent declaration recolor the page
// root through the delivered storefront mechanism. The token lint accepts
// exactly this one declaration in this file, so the checkout view and the
// 9.3.2 paid view share this shell instead of repeating it.
function CheckoutV2Shell({ children, dictionary, presentation }: Readonly<{ children: ReactNode; dictionary: Dictionary; presentation: Readonly<{ branding: PublicCheckoutV2Branding }> }>) {
  const displayName = presentation.branding.displayName ?? dictionary.storefrontFallbackName;
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
      {children}
    </main>
  );
}

function CheckoutV2CompositionFacts({ composition }: Readonly<{ composition: PublicCheckoutV2Composition }>) {
  return composition.kind === "PRODUCT_LINES" ? (
    <ul className="checkout-v2__lines">
      {composition.lines.map((line, index) => (
        <li className="checkout-v2__line" key={`${index}-${line.product.title}`}>
          <p className="checkout-v2__line-title">{line.product.title}</p>
          <p className="checkout-v2__line-description">{line.product.description}</p>
          <p className="checkout-v2__line-price">{line.quantity} × {line.product.price}</p>
        </li>
      ))}
    </ul>
  ) : (
    <p className="checkout-v2__line-description">{composition.description}</p>
  );
}

function CheckoutV2Total({ composition, currencyCode, dictionary }: Readonly<{ composition: PublicCheckoutV2Composition; currencyCode: string | null; dictionary: Dictionary }>) {
  const total = composition.kind === "PRODUCT_LINES" ? composition.total : composition.amount;
  return <p className="checkout-v2__total"><span>{dictionary.checkoutTotalLabel}</span> {total} {currencyCode ?? dictionary.checkoutUnlabeledCurrency}</p>;
}

// The branded two-column Commerce V2 checkout composition (9.3.1): the
// summary column renders only server-derived facts (localized lines or fixed
// description, the seam-derived exact total, and the registry display code or
// the explicit unlabeled treatment) next to the policy-driven customer form.
export function PublicCheckoutV2Page({ dictionary, identifier, presentation }: Readonly<{ dictionary: Dictionary; identifier: string; presentation: PublicCheckoutV2Presentation }>) {
  return (
    <CheckoutV2Shell dictionary={dictionary} presentation={presentation}>
      <div className="checkout-v2__columns">
        <section aria-label={dictionary.checkoutSummaryHeading} className="checkout-v2__summary">
          <h2 className="checkout-v2__heading">{dictionary.checkoutSummaryHeading}</h2>
          <CheckoutV2CompositionFacts composition={presentation.composition} />
          <Separator />
          <CheckoutV2Total composition={presentation.composition} currencyCode={presentation.currencyCode} dictionary={dictionary} />
        </section>
        <PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy={presentation.checkoutPolicy} />
      </div>
    </CheckoutV2Shell>
  );
}

// The paid terminal view (9.3.2) for a consumed SINGLE_USE link: the same
// branded shell and public composition summary with a non-color paid marker
// (icon plus text) — server-rendered only, with no form, polling client,
// mutation affordance, order state, or timestamp.
export function PublicCheckoutV2PaidPage({ dictionary, presentation }: Readonly<{ dictionary: Dictionary; presentation: PublicCheckoutV2PaidPresentation }>) {
  return (
    <CheckoutV2Shell dictionary={dictionary} presentation={presentation}>
      <div className="checkout-v2__columns">
        <section aria-label={dictionary.checkoutPaidHeading} className="checkout-v2__summary">
          <Badge variant="secondary"><CheckCircle2Icon />{dictionary.checkoutPaidBadge}</Badge>
          <h2 className="checkout-v2__heading">{dictionary.checkoutPaidHeading}</h2>
          <p className="checkout-v2__line-description">{dictionary.checkoutPaidDescription}</p>
          <Separator />
          <CheckoutV2CompositionFacts composition={presentation.composition} />
          <Separator />
          <CheckoutV2Total composition={presentation.composition} currencyCode={presentation.currencyCode} dictionary={dictionary} />
        </section>
      </div>
    </CheckoutV2Shell>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MoneyText } from "@/components/ui/money-text";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PublicCheckoutV2Composition, PublicCheckoutV2PaidPresentation, PublicCheckoutV2Presentation } from "@/checkout/public-checkout-v2-presentation";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { CheckoutShell } from "./checkout-shell";
import { PublicCheckoutV2Form } from "./public-checkout-v2-form";

type Dictionary = ReturnType<typeof getDictionary>;

function CheckoutV2CompositionFacts({ composition }: Readonly<{ composition: PublicCheckoutV2Composition }>) {
  return composition.kind === "PRODUCT_LINES" ? (
    <ul className="grid list-none gap-4 p-0 m-0">
      {composition.lines.map((line, index) => (
        <li className="grid gap-1" key={`${index}-${line.product.title}`}>
          <p className="m-0 font-semibold break-words">{line.product.title}</p>
          <p className="m-0 max-w-[var(--layout-max)] whitespace-pre-wrap text-muted-foreground">{line.product.description}</p>
          <p className="m-0 tabular-nums">{line.quantity} × {line.product.price}</p>
        </li>
      ))}
    </ul>
  ) : (
    <p className="m-0 max-w-[var(--layout-max)] whitespace-pre-wrap text-muted-foreground">{composition.description}</p>
  );
}

function CheckoutV2Total({ composition, currencyCode, dictionary }: Readonly<{ composition: PublicCheckoutV2Composition; currencyCode: string | null; dictionary: Dictionary }>) {
  const total = composition.kind === "PRODUCT_LINES" ? composition.total : composition.amount;
  return (
    <p className="m-0 flex items-baseline justify-between gap-2 tabular-nums">
      <span className="text-sm font-semibold text-muted-foreground">{dictionary.checkoutTotalLabel}</span>
      <span className="inline-flex items-baseline gap-1.5">
        <MoneyText size="large" value={total} />
        {currencyCode ? <MoneyText pairLabel={currencyCode} value="" /> : <span className="text-sm text-muted-foreground">{dictionary.checkoutUnlabeledCurrency}</span>}
      </span>
    </p>
  );
}

// The branded single-column Commerce V2 checkout composition (9.3.1,
// converged onto the shared shell by 14.6.1): the summary section renders
// only server-derived facts (localized lines or fixed description, the
// seam-derived exact total, and the registry display code or the explicit
// unlabeled treatment) above the policy-driven customer form, all inside the
// one column at the checkout cap the shell owns.
export function PublicCheckoutV2Page({ dictionary, identifier, locale, presentation }: Readonly<{ dictionary: Dictionary; identifier: string; locale: SupportedLocale; presentation: PublicCheckoutV2Presentation }>) {
  return (
    <CheckoutShell branding={presentation.branding} dictionary={dictionary} locale={locale}>
      <div className="flex flex-col gap-6">
        <Card className="w-full">
          <CardHeader>
            <CardTitle>{dictionary.checkoutSummaryHeading}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <CheckoutV2CompositionFacts composition={presentation.composition} />
            <Separator />
            <CheckoutV2Total composition={presentation.composition} currencyCode={presentation.currencyCode} dictionary={dictionary} />
          </CardContent>
        </Card>
        <PublicCheckoutV2Form dictionary={dictionary} identifier={identifier} policy={presentation.checkoutPolicy} />
      </div>
    </CheckoutShell>
  );
}

// The paid terminal view (9.3.2, converged onto the shared shell by 14.6.1):
// the same branded shell and public composition summary with a non-color
// paid marker (icon plus text) — server-rendered only, with no form, polling
// client, mutation affordance, order state, or timestamp.
export function PublicCheckoutV2PaidPage({ dictionary, locale, presentation }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; presentation: PublicCheckoutV2PaidPresentation }>) {
  return (
    <CheckoutShell branding={presentation.branding} dictionary={dictionary} locale={locale}>
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <StatusBadge label={dictionary.checkoutPaidBadge} tone="success" />
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold leading-7">{dictionary.checkoutPaidHeading}</h2>
            <p className="text-sm text-muted-foreground">{dictionary.checkoutPaidDescription}</p>
          </div>
          <Separator />
          <CheckoutV2CompositionFacts composition={presentation.composition} />
          <Separator />
          <CheckoutV2Total composition={presentation.composition} currencyCode={presentation.currencyCode} dictionary={dictionary} />
        </CardContent>
      </Card>
    </CheckoutShell>
  );
}

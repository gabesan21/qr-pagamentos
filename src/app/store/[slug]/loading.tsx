import { CardSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { getDictionary } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/locales";

import { CheckoutShell } from "@/app/pay/[identifier]/checkout-shell";

export default function PublicStorefrontLoading() {
  const dictionary = getDictionary(defaultLocale);

  return (
    <CheckoutShell busy dictionary={dictionary} locale={defaultLocale} variant="storefront">
      {/* Mirrors the storefront two-column grid; duplicated from the client
          view because a server file cannot import a value from it. */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_calc(var(--space-12)*8)]">
        <div className="grid gap-6">
          <TableSkeleton columns={3} label={dictionary.storefrontProductsHeading} rows={6} />
        </div>
        <div className="grid content-start gap-6">
          <CardSkeleton label={dictionary.storefrontCustomAmountTitle} />
          <CardSkeleton label={dictionary.storefrontCartHeading} />
        </div>
      </div>
    </CheckoutShell>
  );
}

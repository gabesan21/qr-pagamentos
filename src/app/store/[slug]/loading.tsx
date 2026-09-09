import { CardSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { getDictionary } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/locales";

import { CheckoutShell } from "@/app/pay/[identifier]/checkout-shell";

export default function PublicStorefrontLoading() {
  const dictionary = getDictionary(defaultLocale);

  return (
    <CheckoutShell busy dictionary={dictionary} locale={defaultLocale}>
      <CardSkeleton label={dictionary.storefrontProductsHeading} />
      <TableSkeleton columns={3} label={dictionary.storefrontProductsHeading} rows={6} />
      <CardSkeleton label={dictionary.storefrontCartHeading} />
    </CheckoutShell>
  );
}

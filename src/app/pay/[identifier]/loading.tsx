import { CheckoutSkeleton } from "@/components/ui/skeletons";
import { getDictionary } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/locales";

import { CheckoutShell } from "./checkout-shell";

export default function PublicCheckoutLoading() {
  const dictionary = getDictionary(defaultLocale);
  return (
    <CheckoutShell busy dictionary={dictionary} locale={defaultLocale}>
      <CheckoutSkeleton label={dictionary.checkoutLoadingLabel} />
    </CheckoutShell>
  );
}

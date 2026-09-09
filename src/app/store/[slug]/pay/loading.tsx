import { CheckoutSkeleton } from "@/components/ui/skeletons";
import { getDictionary } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/locales";

import { CheckoutShell } from "@/app/pay/[identifier]/checkout-shell";

export default function StandalonePaymentLoading() {
  const dictionary = getDictionary(defaultLocale);

  return (
    <CheckoutShell busy dictionary={dictionary} locale={defaultLocale}>
      <CheckoutSkeleton label={dictionary.checkoutLoadingLabel} />
    </CheckoutShell>
  );
}

import { cookies } from "next/headers";

import { CheckoutSkeleton } from "@/components/ui/skeletons";
import { getDictionary } from "@/i18n/dictionaries";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";

import { CheckoutShell } from "@/app/pay/[identifier]/checkout-shell";

export default async function StandalonePaymentLoading() {
  const cookieStore = await cookies();
  const locale = localeFromPreferenceCookie(cookieStore.get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);

  return (
    <CheckoutShell busy dictionary={dictionary} locale={locale}>
      <CheckoutSkeleton label={dictionary.checkoutLoadingLabel} />
    </CheckoutShell>
  );
}

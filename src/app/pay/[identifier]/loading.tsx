import { CheckoutSkeleton } from "@/components/ui/skeletons";
import { getDictionary } from "@/i18n/dictionaries";
import { defaultLocale } from "@/i18n/locales";

export default function PublicCheckoutLoading() {
  const dictionary = getDictionary(defaultLocale);
  return (
    <main aria-busy="true" className="checkout-shell">
      <div className="checkout-main">
        <CheckoutSkeleton label={dictionary.checkoutLoadingLabel} />
      </div>
    </main>
  );
}

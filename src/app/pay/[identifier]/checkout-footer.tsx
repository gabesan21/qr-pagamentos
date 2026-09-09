import { LanguageSwitcher } from "@/app/language-preference/language-switcher";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { CheckoutPrivacyNotice } from "./checkout-privacy-notice";

type Dictionary = ReturnType<typeof getDictionary>;

// Public checkout footer (template `Footer`): powered-by copy, the privacy
// link opening the notice modal, and the language switcher. The anonymous
// `qr_locale` cookie keeps deciding the locale for an unauthenticated buyer —
// `LanguageSwitcher` posts to the shared `/language-preference` route.
export function CheckoutFooter({ dictionary, locale }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale }>) {
  return (
    <footer className="flex flex-col items-center gap-3 border-t px-6 py-5 text-center">
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">{dictionary.checkoutPoweredBy}</span>
        <LanguageSwitcher label={dictionary.languageLabel} locale={locale} />
      </div>
      <CheckoutPrivacyNotice dictionary={dictionary} />
    </footer>
  );
}

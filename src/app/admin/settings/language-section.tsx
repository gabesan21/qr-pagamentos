import type { SupportedLocale } from "@/i18n/locales";
import { LocaleFlagChoices } from "@/app/language-preference/language-switcher";

import type { Dictionary } from "./settings-surface";
import { SettingsSectionNotice, type SectionNotice } from "./settings-section-notice";

// Every button is a real `type="submit"`: clicking one always posts
// `/language-preference` immediately, with no separate Save step — the same
// "apply on selection" contract the shell switcher's `requestSubmit()` gives
// its native `<select>`, adapted to a segmented control. Because the submit
// is native, the control needs no JS at all, which doubles as the required
// no-JS fallback.
export function LanguageSection({
  dictionary,
  locale,
  notice,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; notice: SectionNotice }>) {
  return (
    <form action="/language-preference" method="post">
      {/* The global `language=saved|error` toast pair is already registered
          once in the root layout; this section only needs the `<noscript>`
          Alert fallback, so it passes no toast entries of its own to avoid
          stacking a duplicate toast on every language change. */}
      <SettingsSectionNotice dictionary={dictionary} notice={notice} toastEntries={[]} />
      <LocaleFlagChoices label={dictionary.languageHeading} submit value={locale} />
    </form>
  );
}

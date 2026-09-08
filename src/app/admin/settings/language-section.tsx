import type { SupportedLocale } from "@/i18n/locales";

import type { Dictionary } from "./settings-surface";
import { SettingsSectionNotice, type SectionNotice } from "./settings-section-notice";

const LOCALES: readonly { id: SupportedLocale; label: string }[] = [
  { id: "pt-BR", label: "PT-BR" },
  { id: "en", label: "EN" },
];

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
      <SettingsSectionNotice
        dictionary={dictionary}
        notice={notice}
        toastEntries={[
          { param: "language", value: "saved", kind: "success", message: dictionary.languageSaved },
          { param: "language", value: "error", kind: "error", message: dictionary.languageError },
        ]}
      />
      <div className="inline-flex gap-1 rounded-md bg-muted p-1">
        {LOCALES.map((item) => {
          const active = locale === item.id;
          return (
            <button
              key={item.id}
              aria-pressed={active}
              className={`relative flex min-h-11 items-center justify-center rounded px-4 text-xs font-semibold uppercase transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              disabled={active}
              name="locale"
              type="submit"
              value={item.id}
            >
              {active ? <span className="absolute inset-0 rounded bg-background shadow-sm" /> : null}
              <span className="relative">{item.label}</span>
            </button>
          );
        })}
      </div>
    </form>
  );
}

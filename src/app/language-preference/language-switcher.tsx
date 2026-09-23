"use client";

import { Globe } from "lucide-react";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SupportedLocale } from "@/i18n/locales";

// Compact globe + PT/EN variant for non-shell surfaces (auth pages): the shell's own
// LanguageSwitcherForm is a different, labelled composition and stays owned by 14.4.1.
// Dictionaries are server-only, so the accessible label is passed in as a prop.
const LOCALE_OPTIONS: readonly { label: string; value: SupportedLocale }[] = [
  { label: "PT", value: "pt-BR" },
  { label: "EN", value: "en" },
];

export function LanguageSwitcher({ label, locale }: Readonly<{ label: string; locale: SupportedLocale }>) {
  return (
    <form action="/language-preference" method="post">
      <div className="flex h-11 items-center gap-1.5 rounded-md border border-border bg-bg px-2.5 text-text-2">
        <Globe aria-hidden="true" className="size-4" />
        <NativeSelect
          aria-label={label}
          className="w-auto min-w-11"
          defaultValue={locale}
          name="locale"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          size="sm"
        >
          {LOCALE_OPTIONS.map((option) => (
            <NativeSelectOption key={option.value} value={option.value}>
              {option.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </form>
  );
}

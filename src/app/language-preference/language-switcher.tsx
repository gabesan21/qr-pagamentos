"use client";

import { Globe } from "lucide-react";

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
      <div className="flex h-11 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-muted-foreground">
        <Globe aria-hidden="true" className="size-4" />
        <select
          aria-label={label}
          className="h-full min-w-11 cursor-pointer bg-transparent text-xs font-semibold text-foreground focus:outline-none"
          defaultValue={locale}
          name="locale"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
        >
          {LOCALE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}

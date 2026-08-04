"use client";

import { useState } from "react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import type { SupportedLocale } from "@/i18n/locales";

import type { Dictionary } from "./settings-surface";

const LOCALES: readonly { id: SupportedLocale; label: string }[] = [
  { id: "pt-BR", label: "PT-BR" },
  { id: "en", label: "EN" },
];

export function LanguageSection({ dictionary, locale }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale }>) {
  const [selected, setSelected] = useState<SupportedLocale>(locale);

  return (
    <form action="/language-preference" method="post">
      <div className="inline-flex gap-1 rounded-md bg-muted p-1">
        {LOCALES.map((item) => {
          const active = selected === item.id;
          return (
            <button
              key={item.id}
              aria-pressed={active}
              className={`relative flex min-h-11 items-center justify-center rounded px-4 text-xs font-semibold uppercase transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setSelected(item.id)}
              type="button"
            >
              {active ? <span className="absolute inset-0 rounded bg-background shadow-sm" /> : null}
              <span className="relative">{item.label}</span>
            </button>
          );
        })}
      </div>
      <input name="locale" type="hidden" value={selected} />
      <div className="mt-4">
        <AdminSubmit disabled={selected === locale} label={dictionary.languageSave} tone="secondary" />
      </div>
    </form>
  );
}

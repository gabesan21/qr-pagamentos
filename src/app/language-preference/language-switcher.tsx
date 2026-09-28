"use client";

import { CheckIcon, MinusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SupportedLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

export const localeChoices: readonly Readonly<{ name: string; value: SupportedLocale }>[] = [
  { name: "Português (Brasil)", value: "pt-BR" },
  { name: "English", value: "en" },
];

export function LocaleFlag({ locale }: Readonly<{ locale: SupportedLocale }>) {
  return <img alt="" aria-hidden="true" className="size-5" src={`/locale-flags/${locale === "pt-BR" ? "br" : "us"}.svg`} />;
}

export function LocaleFlagChoices({ allowClear = false, label, name = "locale", onChange, submit = false, value }: Readonly<{
  allowClear?: boolean;
  label: string;
  name?: string;
  onChange?: (locale: SupportedLocale) => void;
  submit?: boolean;
  value: SupportedLocale | "";
}>) {
  const choices = allowClear ? [...localeChoices, { name: "No explicit preference", value: "" }] : localeChoices;
  return <div aria-label={label} className="inline-flex gap-1 rounded-md bg-surface-2 p-1">
    {choices.map((choice) => {
      const selected = value === choice.value;
      return <Button aria-label={choice.name} aria-pressed={selected} className={cn("relative", selected ? "bg-bg text-text shadow-sm" : "text-text-2 hover:text-text")} key={choice.value} name={submit ? name : undefined} onClick={() => onChange?.(choice.value as SupportedLocale)} size="icon" title={choice.name} type={submit ? "submit" : "button"} value={submit ? choice.value : undefined} variant="ghost">
        {choice.value ? <LocaleFlag locale={choice.value as SupportedLocale} /> : <MinusIcon aria-hidden="true" className="size-5" />}
        {selected ? <CheckIcon aria-hidden="true" className="absolute bottom-0.5 right-0.5 size-3 text-primary" /> : null}
      </Button>;
    })}
    {!submit ? <input name={name} type="hidden" value={value} /> : null}
  </div>;
}

export function LanguageSwitcher({ label, locale }: Readonly<{ label: string; locale: SupportedLocale }>) {
  return <form action="/language-preference" method="post"><LocaleFlagChoices label={label} submit value={locale} /></form>;
}

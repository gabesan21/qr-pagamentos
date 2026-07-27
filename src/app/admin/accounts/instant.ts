import type { SupportedLocale } from "@/i18n/locales";

// One localized instant treatment for the account directory and detail:
// medium date plus short time, rendered in UTC like every panel timestamp.
export function formatAccountInstant(value: Date, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value);
}

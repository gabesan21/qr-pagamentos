import type { SupportedLocale } from "@/i18n/locales";

// One localized instant treatment for the account directory and detail:
// medium date plus short time, rendered in UTC like every panel timestamp.
export function formatAccountInstant(value: Date, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(value);
}

const MILLISECONDS_PER_DAY = 86_400_000;

function utcCalendarDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

// Relative last-activity beside the absolute instant: "today" for the same
// UTC calendar day, otherwise a localized "N days ago" via the platform
// relative-time formatter (no bespoke pluralization table to maintain).
export function formatRelativeAccountActivity(value: Date, locale: SupportedLocale, todayLabel: string) {
  const daysAgo = Math.round((utcCalendarDay(new Date()) - utcCalendarDay(value)) / MILLISECONDS_PER_DAY);
  if (daysAgo <= 0) return todayLabel;
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-daysAgo, "day");
}

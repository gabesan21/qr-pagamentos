import type { SupportedLocale } from "@/i18n/locales";

// Exact-string presentation for the merchant orders list (H-17.1). The
// canonical decimal snapshot is grouped and labeled without ever passing
// through `Number`; the currency code is resolved server-side from the
// order's registry pair. USD/USDT keep their American separators in both
// locales, BRL renders the Brazilian symbol with at least two decimals, and
// an unresolved pair renders the bare localized amount so an unknown
// currency is never mislabeled as BRL.

function localeSeparators(locale: SupportedLocale) {
  return locale === "pt-BR"
    ? { grouping: ".", decimal: "," }
    : { grouping: ",", decimal: "." };
}

function groupDecimal(amount: string, grouping: string, decimal: string, minFraction: number) {
  const [integer, fraction = ""] = amount.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);
  const padded = fraction.length >= minFraction ? fraction : fraction.padEnd(minFraction, "0");
  return `${grouped}${padded ? `${decimal}${padded}` : ""}`;
}

export function formatOrderAmount(amount: string, currencyCode: string | null, locale: SupportedLocale) {
  const code = currencyCode?.toUpperCase() ?? null;
  if (code === "BRL") {
    const { grouping, decimal } = localeSeparators(locale);
    return `R$ ${groupDecimal(amount, grouping, decimal, 2)}`;
  }
  if (code === "USD" || code === "USDT") {
    return `${groupDecimal(amount, ",", ".", 2)} ${code}`;
  }
  const { grouping, decimal } = localeSeparators(locale);
  const display = groupDecimal(amount, grouping, decimal, 0);
  return code ? `${display} ${code}` : display;
}

// Two-digit day/month/year and a separate two-digit hour/minute reading, both
// pinned to UTC so the compact list never shifts the stored instant. The
// shared medium formatter used by the order detail stays untouched.
export function formatOrderCompactDate(value: Date, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" }).format(value);
}

export function formatOrderCompactTime(value: Date, locale: SupportedLocale) {
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(value);
}

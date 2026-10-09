import type { SupportedLocale } from "@/i18n/locales";
import { formatOrderAmount } from "../orders/order-format";

// Locale-formatted exact price with the nullable currency code; the canonical
// stored decimal string is never converted through Number.
export function formatCatalogPrice(price: string, currencyCode: string | null, locale: SupportedLocale) {
  if (price !== "" && currencyCode === "BRL" && locale === "pt-BR") {
    return formatOrderAmount(price, currencyCode, locale);
  }
  const [integer, fraction] = price.split(".");
  const grouping = locale === "pt-BR" ? "." : ",";
  const decimal = locale === "pt-BR" ? "," : ".";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);
  const formatted = `${grouped}${fraction ? `${decimal}${fraction}` : ""}`;
  return currencyCode ? `${formatted} ${currencyCode}` : formatted;
}

import type { SupportedLocale } from "@/i18n/locales";

export function formatProductPrice(price: string, locale: SupportedLocale) {
  const [integer, fraction] = price.split(".");
  const grouping = locale === "pt-BR" ? "." : ",";
  const decimal = locale === "pt-BR" ? "," : ".";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);
  return locale === "pt-BR"
    ? `R$ ${grouped}${fraction ? `${decimal}${fraction}` : ""}`
    : `BRL ${grouped}${fraction ? `${decimal}${fraction}` : ""}`;
}

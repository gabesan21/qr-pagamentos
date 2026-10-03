// Presentation only: never coerce a canonical exact decimal through Number.
// BRL always uses Brazilian grouping and R$; other known codes retain their
// identity, and an unresolved code is never inferred to be BRL.
export function formatPublicMoney(amount: string, currencyCode: string | null, locale: "pt-BR" | "en"): string {
  if (!amount) return amount;
  const code = currencyCode?.toUpperCase() ?? null;
  const brl = code === "BRL";
  const american = code === "USD" || code === "USDT";
  const brazilianSeparators = brl || (!american && locale === "pt-BR");
  const [integer, fraction = ""] = amount.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, brazilianSeparators ? "." : ",");
  const padded = brl || american ? fraction.padEnd(2, "0") : fraction;
  const display = `${grouped}${padded ? `${brazilianSeparators ? "," : "."}${padded}` : ""}`;
  return brl ? `R$ ${display}` : code ? `${display} ${code}` : display;
}

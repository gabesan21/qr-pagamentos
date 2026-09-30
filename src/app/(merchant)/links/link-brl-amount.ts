// Pure, client-safe BRL cash-mask helpers for the merchant link form,
// mirroring H-16.1's storefront adapter: a localized display (`R$` prefix,
// dot grouping, comma decimals), a strict localized-paste parser, and a
// digit-to-cents editor that keeps an exact unscaled digit string. `Number`
// never touches an amount — the canonical output is always the ASCII decimal
// the server already validates (`link-money.ts` grammar).

import { isLinkMoneyAmount } from "./link-money";

export type BrlAmountParts = Readonly<{ whole: string; fraction?: string }>;

// Parses a localized BRL draft (optional `R$` prefix, grouped or bare whole
// part, optional comma fraction of at most six digits). Malformed or
// ambiguous grouping returns `null` so callers can keep the draft invalid
// instead of guessing a value.
export function brlAmountParts(value: string): BrlAmountParts | null {
  const unprefixed = value.trim().replace(/^R\$\s?/, "");
  const [whole, ...fractions] = unprefixed.split(",");
  if (fractions.length > 1 || !whole) return null;
  const fraction = fractions[0];
  const ungrouped = /^\d+$/.test(whole);
  const grouped = /^\d{1,3}(?:\.\d{3})+$/.test(whole);
  if ((!ungrouped && !grouped) || (fraction !== undefined && !/^\d{1,6}$/.test(fraction))) return null;
  return { whole: whole.replaceAll(".", ""), ...(fraction === undefined ? {} : { fraction }) };
}

/** Formats a canonical amount as a BRL display string without rounding. */
export function formatBrlDisplay(amount: string): string {
  if (!isLinkMoneyAmount(amount)) return amount;
  const [whole, fraction] = amount.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${grouped},${(fraction ?? "").padEnd(2, "0")}`;
}

/** Converts a localized BRL draft to the canonical ASCII decimal, or `""`. */
export function canonicalBrlInput(value: string): string {
  const parts = brlAmountParts(value);
  if (!parts) return "";
  const normalizedWhole = parts.whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = parts.fraction?.replace(/0+$/, "");
  return normalizedFraction ? `${normalizedWhole || "0"}.${normalizedFraction}` : normalizedWhole || "0";
}

export type BrlCashDigits = Readonly<{ digits: string; precision: number }>;

export function brlCashDigits(value: string): BrlCashDigits | null {
  const parts = brlAmountParts(value);
  if (!parts) return null;
  const precision = Math.max(2, parts.fraction?.length ?? 0);
  const whole = parts.whole.replace(/^0+(?=\d)/, "") || "0";
  return { digits: `${whole}${(parts.fraction ?? "").padEnd(precision, "0")}`, precision };
}

export function brlCashValue(digits: string, precision: number): Readonly<{ display: string; canonical: string }> {
  if (digits === "") return { display: "", canonical: "" };
  const padded = digits.padStart(precision + 1, "0");
  const whole = padded.slice(0, -precision).replace(/^0+(?=\d)/, "") || "0";
  const fraction = padded.slice(-precision);
  const canonical = `${whole}.${fraction.replace(/0+$/, "")}`.replace(/\.$/, "");
  return { display: canonical === "0" ? "R$ 0,00" : formatBrlDisplay(canonical), canonical };
}

export function digitBoundary(value: string, caret: number): number {
  return [...value.slice(0, caret)].filter((character) => /\d/.test(character)).length;
}

export function caretAtDigitBoundary(value: string, boundary: number): number {
  if (boundary <= 0) return value.search(/\d/);
  let seen = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (/\d/.test(value[index])) seen += 1;
    if (seen === boundary) return index + 1;
  }
  return value.length;
}

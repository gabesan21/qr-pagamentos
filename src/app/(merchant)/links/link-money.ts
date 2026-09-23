// Pure, client-safe exact-decimal money for the merchant link surfaces
// (directory, form, detail): BigInt micro-units at the product-price
// grammar's 6-place scale, mirroring `src/storefront/cart.ts` exactly. No
// `server-only` import here — the create/edit form (F02) needs this module
// in a client component for the live running total. `Number` never touches
// an amount in these files.

const MICRO_UNIT_SCALE = BigInt(1_000_000);
const MICRO_UNIT_DIGITS = 6;
const ZERO_MICRO_UNITS = BigInt(0);

// Same canonical positive-decimal class as the product-price grammar: up to
// twelve integer digits without leading zeros and up to six fraction digits
// with a non-zero last digit.
const AMOUNT_PATTERN = /^(?:0\.[0-9]{0,5}[1-9]|[1-9][0-9]{0,11}(?:\.[0-9]{0,5}[1-9])?)$/;

export function isLinkMoneyAmount(value: unknown): value is string {
  return typeof value === "string" && AMOUNT_PATTERN.test(value);
}

function amountToMicroUnits(amount: string): bigint {
  const [integerPart, fractionPart = ""] = amount.split(".");
  const fraction = fractionPart.padEnd(MICRO_UNIT_DIGITS, "0");
  return BigInt(integerPart) * MICRO_UNIT_SCALE + BigInt(fraction || "0");
}

function microUnitsToAmount(units: bigint): string {
  const integer = units / MICRO_UNIT_SCALE;
  const fraction = (units % MICRO_UNIT_SCALE).toString().padStart(MICRO_UNIT_DIGITS, "0").replace(/0+$/, "");
  return fraction === "" ? integer.toString() : `${integer}.${fraction}`;
}

// Exact line total: a canonical decimal unit price times a positive integer
// quantity, entirely in BigInt micro-units.
export function linkMoneyMultiply(unitPrice: string, quantity: number): string {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new RangeError("linkMoneyMultiply requires a non-negative integer quantity");
  }
  return microUnitsToAmount(amountToMicroUnits(unitPrice) * BigInt(quantity));
}

// Exact sum of any number of canonical decimal-string amounts (line totals,
// per-order confirmed volumes); an empty list sums to "0".
export function linkMoneySum(amounts: readonly string[]): string {
  const total = amounts.reduce((sum, amount) => sum + amountToMicroUnits(amount), ZERO_MICRO_UNITS);
  return microUnitsToAmount(total);
}

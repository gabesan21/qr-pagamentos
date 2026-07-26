// Pure browser-cart core for the sessionless storefront: framework-free and
// free of `server-only` so the client cart boundary can import it. It owns the
// versioned storage envelope, the canonical positive-decimal amount grammar,
// exact BigInt arithmetic at the grammar's 6-place scale, stale-item
// reconciliation, and per-currency totals. Server BigInt money modules are not
// client-safe and are never imported here; `Number` and floats never touch
// money.

export const STOREFRONT_CART_VERSION = 1;
export const STOREFRONT_CART_QUANTITY_MINIMUM = 1;
export const STOREFRONT_CART_QUANTITY_MAXIMUM = 9_999;

// Same canonical positive-decimal class as the product price grammar: up to
// twelve integer digits without leading zeros and up to six fraction digits
// with a non-zero last digit.
const AMOUNT_PATTERN = /^(?:0\.[0-9]{0,5}[1-9]|[1-9][0-9]{0,11}(?:\.[0-9]{0,5}[1-9])?)$/;
const MICRO_UNIT_SCALE = BigInt(1_000_000);
const ZERO_MICRO_UNITS = BigInt(0);
const MICRO_UNIT_DIGITS = 6;

export type StorefrontCartProductItem = Readonly<{
  kind: "product";
  reference: string;
  quantity: number;
}>;

export type StorefrontCartCustomAmountItem = Readonly<{
  kind: "custom-amount";
  amount: string;
}>;

export type StorefrontCartItem = StorefrontCartProductItem | StorefrontCartCustomAmountItem;

// The minimal catalog facts reconciliation and totals need; the server
// projection already redacts everything else before it reaches the browser.
export type StorefrontCartCatalogProduct = Readonly<{
  reference: string;
  price: string;
  currencyCode: string | null;
  available: boolean;
}>;

export type StorefrontCartTotal = Readonly<{
  currencyCode: string | null;
  total: string;
}>;

export type StorefrontCartHydration = Readonly<{
  items: readonly StorefrontCartItem[];
  // True only when a parseable current-version envelope held entries that
  // reconciliation dropped or clamped; unknown versions and unparseable
  // payloads discard silently instead.
  recovered: boolean;
}>;

export function storefrontCartStorageKey(slug: string): string {
  return `qr-pagamentos:storefront-cart:v${STOREFRONT_CART_VERSION}:${slug}`;
}

export function isStorefrontCartAmount(value: unknown): value is string {
  return typeof value === "string" && AMOUNT_PATTERN.test(value);
}

export function storefrontCartAmountToMicroUnits(amount: string): bigint {
  const [integerPart, fractionPart = ""] = amount.split(".");
  const fraction = fractionPart.padEnd(MICRO_UNIT_DIGITS, "0");
  return BigInt(integerPart) * MICRO_UNIT_SCALE + BigInt(fraction || "0");
}

export function storefrontCartMicroUnitsToAmount(units: bigint): string {
  const integer = units / MICRO_UNIT_SCALE;
  const fraction = (units % MICRO_UNIT_SCALE).toString().padStart(MICRO_UNIT_DIGITS, "0").replace(/0+$/, "");
  return fraction === "" ? integer.toString() : `${integer}.${fraction}`;
}

function catalogIndex(catalog: readonly StorefrontCartCatalogProduct[]): Map<string, StorefrontCartCatalogProduct> {
  return new Map(catalog.map((product) => [product.reference, product]));
}

// Reconciles a stored envelope against the server-rendered catalog snapshot:
// stale or unavailable references drop, quantities clamp to 1–9,999, duplicate
// references keep the first entry, and the single custom amount survives only
// while standalone payments stay enabled with a valid amount. The cart never
// trusts stored data beyond item identity.
export function hydrateStorefrontCart(
  stored: string | null,
  catalog: readonly StorefrontCartCatalogProduct[],
  standalonePayments: boolean,
): StorefrontCartHydration {
  if (stored === null) return { items: [], recovered: false };
  let envelope: unknown;
  try {
    envelope = JSON.parse(stored);
  } catch {
    return { items: [], recovered: false };
  }
  if (typeof envelope !== "object" || envelope === null) return { items: [], recovered: false };
  const candidate = envelope as { version?: unknown; items?: unknown };
  if (candidate.version !== STOREFRONT_CART_VERSION || !Array.isArray(candidate.items)) {
    return { items: [], recovered: false };
  }

  const products = catalogIndex(catalog);
  const seenReferences = new Set<string>();
  const items: StorefrontCartItem[] = [];
  let recovered = false;
  let customAmountSeen = false;

  for (const entry of candidate.items as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      recovered = true;
      continue;
    }
    const item = entry as { kind?: unknown; reference?: unknown; quantity?: unknown; amount?: unknown };
    if (item.kind === "product") {
      const product = typeof item.reference === "string" ? products.get(item.reference) : undefined;
      if (!product || !product.available || seenReferences.has(product.reference)) {
        recovered = true;
        continue;
      }
      if (typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity < STOREFRONT_CART_QUANTITY_MINIMUM) {
        recovered = true;
        continue;
      }
      seenReferences.add(product.reference);
      const quantity = Math.min(item.quantity, STOREFRONT_CART_QUANTITY_MAXIMUM);
      if (quantity !== item.quantity) recovered = true;
      items.push({ kind: "product", reference: product.reference, quantity });
      continue;
    }
    if (item.kind === "custom-amount") {
      if (!standalonePayments || customAmountSeen || !isStorefrontCartAmount(item.amount)) {
        recovered = true;
        continue;
      }
      customAmountSeen = true;
      items.push({ kind: "custom-amount", amount: item.amount });
      continue;
    }
    recovered = true;
  }
  return { items, recovered };
}

export function serializeStorefrontCart(items: readonly StorefrontCartItem[]): string {
  return JSON.stringify({ version: STOREFRONT_CART_VERSION, items });
}

// Sets a product quantity: zero removes the item, anything above the maximum
// clamps, and an absent reference appends in cart order.
export function setStorefrontCartProductQuantity(
  items: readonly StorefrontCartItem[],
  reference: string,
  quantity: number,
): StorefrontCartItem[] {
  const clamped = Math.min(Math.max(Math.trunc(quantity), 0), STOREFRONT_CART_QUANTITY_MAXIMUM);
  const index = items.findIndex((item) => item.kind === "product" && item.reference === reference);
  if (clamped === 0) return index === -1 ? [...items] : items.filter((_, position) => position !== index);
  const next = [...items];
  const entry: StorefrontCartProductItem = { kind: "product", reference, quantity: clamped };
  if (index === -1) next.push(entry);
  else next[index] = entry;
  return next;
}

// Adds, replaces, or removes (null) the single custom-amount item.
export function setStorefrontCartCustomAmount(
  items: readonly StorefrontCartItem[],
  amount: string | null,
): StorefrontCartItem[] {
  const without = items.filter((item) => item.kind !== "custom-amount");
  return amount === null ? without : [{ kind: "custom-amount", amount }, ...without];
}

// Exact line and grouped totals: product lines multiply their snapshotted
// catalog price by quantity, the custom amount contributes its own value, and
// groups never sum across currency codes. A null-code group renders without a
// code label. Group order is first-seen cart order.
export function storefrontCartTotals(
  items: readonly StorefrontCartItem[],
  catalog: readonly StorefrontCartCatalogProduct[],
  standalonePaymentCurrencyCode: string | null,
): { lines: ReadonlyMap<StorefrontCartItem, string>; groups: readonly StorefrontCartTotal[] } {
  const products = catalogIndex(catalog);
  const lines = new Map<StorefrontCartItem, string>();
  const grouped = new Map<string | null, bigint>();
  const groupOrder: Array<string | null> = [];

  const record = (currencyCode: string | null, microUnits: bigint) => {
    if (!grouped.has(currencyCode)) groupOrder.push(currencyCode);
    grouped.set(currencyCode, (grouped.get(currencyCode) ?? ZERO_MICRO_UNITS) + microUnits);
  };

  for (const item of items) {
    if (item.kind === "product") {
      const product = products.get(item.reference);
      if (!product) continue;
      const lineMicroUnits = storefrontCartAmountToMicroUnits(product.price) * BigInt(item.quantity);
      lines.set(item, storefrontCartMicroUnitsToAmount(lineMicroUnits));
      record(product.currencyCode, lineMicroUnits);
      continue;
    }
    const lineMicroUnits = storefrontCartAmountToMicroUnits(item.amount);
    lines.set(item, storefrontCartMicroUnitsToAmount(lineMicroUnits));
    record(standalonePaymentCurrencyCode, lineMicroUnits);
  }

  return {
    lines,
    groups: groupOrder.map((currencyCode) => ({
      currencyCode,
      total: storefrontCartMicroUnitsToAmount(grouped.get(currencyCode) ?? ZERO_MICRO_UNITS),
    })),
  };
}

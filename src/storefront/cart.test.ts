import { describe, expect, it } from "vitest";

import {
  hydrateStorefrontCart,
  isStorefrontCartAmount,
  serializeStorefrontCart,
  setStorefrontCartCustomAmount,
  setStorefrontCartProductQuantity,
  storefrontCartAmountToMicroUnits,
  storefrontCartMicroUnitsToAmount,
  storefrontCartStorageKey,
  storefrontCartTotals,
  type StorefrontCartCatalogProduct,
  type StorefrontCartItem,
} from "./cart";

const coffee: StorefrontCartCatalogProduct = {
  reference: "11111111-1111-4111-8111-111111111111",
  price: "12.50",
  currencyCode: "BRL",
  available: true,
};
const tea: StorefrontCartCatalogProduct = {
  reference: "22222222-2222-4222-8222-222222222222",
  price: "0.000001",
  currencyCode: null,
  available: true,
};
const stale: StorefrontCartCatalogProduct = {
  reference: "33333333-3333-4333-8333-333333333333",
  price: "9",
  currencyCode: "USD",
  available: false,
};
const catalog = [coffee, tea];

describe("storefront cart storage envelope", () => {
  it("scopes the storage key to the closed version and the store slug", () => {
    expect(storefrontCartStorageKey("ana-store")).toBe("qr-pagamentos:storefront-cart:v1:ana-store");
  });

  it("round-trips items through the versioned envelope", () => {
    const items: StorefrontCartItem[] = [
      { kind: "custom-amount", amount: "5" },
      { kind: "product", reference: coffee.reference, quantity: 3 },
    ];
    const stored = serializeStorefrontCart(items);
    expect(JSON.parse(stored)).toEqual({ version: 1, items });
    expect(hydrateStorefrontCart(stored, catalog, true)).toEqual({ items, recovered: false });
  });

  it("discards unknown versions, unparseable payloads, and absent storage silently", () => {
    expect(hydrateStorefrontCart(null, catalog, true)).toEqual({ items: [], recovered: false });
    expect(hydrateStorefrontCart("not json", catalog, true)).toEqual({ items: [], recovered: false });
    expect(hydrateStorefrontCart(JSON.stringify({ version: 2, items: [{ kind: "product", reference: coffee.reference, quantity: 1 }] }), catalog, true))
      .toEqual({ items: [], recovered: false });
    expect(hydrateStorefrontCart(JSON.stringify({ items: [] }), catalog, true)).toEqual({ items: [], recovered: false });
    expect(hydrateStorefrontCart(JSON.stringify("v1"), catalog, true)).toEqual({ items: [], recovered: false });
  });
});

describe("storefront cart reconciliation", () => {
  it("drops stale, unavailable, duplicated, and malformed entries with one recovery signal", () => {
    const stored = serializeStorefrontCart([
      { kind: "product", reference: coffee.reference, quantity: 2 },
      { kind: "product", reference: stale.reference, quantity: 1 },
      { kind: "product", reference: "99999999-9999-4999-8999-999999999999", quantity: 1 },
      { kind: "product", reference: coffee.reference, quantity: 5 },
      { kind: "product", reference: tea.reference, quantity: 0 },
      { kind: "product", reference: tea.reference, quantity: 1.5 },
      { kind: "product", reference: tea.reference, quantity: "2" },
      { kind: "product", quantity: 2 },
      { kind: "donation", amount: "5" },
      "garbage",
      null,
    ] as never);

    const hydration = hydrateStorefrontCart(stored, [coffee, tea, stale], true);
    expect(hydration).toEqual({
      items: [{ kind: "product", reference: coffee.reference, quantity: 2 }],
      recovered: true,
    });
  });

  it("clamps quantities above 9,999 and keeps the boundary values", () => {
    const over = hydrateStorefrontCart(
      serializeStorefrontCart([{ kind: "product", reference: coffee.reference, quantity: 10_000 }]),
      catalog,
      true,
    );
    expect(over).toEqual({ items: [{ kind: "product", reference: coffee.reference, quantity: 9_999 }], recovered: true });

    const exact = hydrateStorefrontCart(
      serializeStorefrontCart([{ kind: "product", reference: coffee.reference, quantity: 9_999 }]),
      catalog,
      true,
    );
    expect(exact).toEqual({ items: [{ kind: "product", reference: coffee.reference, quantity: 9_999 }], recovered: false });
  });

  it("keeps at most one custom amount and only while standalone payments stay enabled", () => {
    const dropped = hydrateStorefrontCart(
      serializeStorefrontCart([{ kind: "custom-amount", amount: "5" }]),
      catalog,
      false,
    );
    expect(dropped).toEqual({ items: [], recovered: true });

    const duplicated = hydrateStorefrontCart(
      serializeStorefrontCart([
        { kind: "custom-amount", amount: "5" },
        { kind: "custom-amount", amount: "7" },
        { kind: "custom-amount", amount: "0" },
      ]),
      catalog,
      true,
    );
    expect(duplicated).toEqual({ items: [{ kind: "custom-amount", amount: "5" }], recovered: true });
  });
});

describe("storefront cart amount grammar and exact arithmetic", () => {
  it("accepts only the canonical positive-decimal grammar", () => {
    for (const valid of ["1", "12.5", "0.5", "0.000001", "999999999999", "999999999999.000001"]) {
      expect(isStorefrontCartAmount(valid), valid).toBe(true);
    }
    for (const invalid of ["", "0", "0.0", "0.00", "12.50", "01", "1.", ".5", "-1", "+1", "1.0000001", "1.0000000", "1000000000000", "abc", "1,5", " 1", "1 "]) {
      expect(isStorefrontCartAmount(invalid), invalid).toBe(false);
    }
  });

  it("converts between canonical decimals and 6-place micro units without floats", () => {
    expect(storefrontCartAmountToMicroUnits("0.000001")).toBe(BigInt(1));
    expect(storefrontCartAmountToMicroUnits("1")).toBe(BigInt(1_000_000));
    expect(storefrontCartAmountToMicroUnits("12.5")).toBe(BigInt(12_500_000));
    expect(storefrontCartAmountToMicroUnits("999999999999.000001")).toBe(BigInt("999999999999000001"));
    expect(storefrontCartMicroUnitsToAmount(BigInt(1))).toBe("0.000001");
    expect(storefrontCartMicroUnitsToAmount(BigInt(1_000_000))).toBe("1");
    expect(storefrontCartMicroUnitsToAmount(BigInt(12_500_000))).toBe("12.5");
    expect(storefrontCartMicroUnitsToAmount(BigInt(9_999))).toBe("0.009999");
    expect(storefrontCartMicroUnitsToAmount(BigInt("999999999999000001"))).toBe("999999999999.000001");
  });
});

describe("storefront cart mutations", () => {
  it("sets, clamps, and removes product quantities", () => {
    let items: StorefrontCartItem[] = [];
    items = setStorefrontCartProductQuantity(items, coffee.reference, 2);
    expect(items).toEqual([{ kind: "product", reference: coffee.reference, quantity: 2 }]);
    items = setStorefrontCartProductQuantity(items, coffee.reference, 99_999);
    expect(items).toEqual([{ kind: "product", reference: coffee.reference, quantity: 9_999 }]);
    items = setStorefrontCartProductQuantity(items, tea.reference, 1.9);
    expect(items).toEqual([
      { kind: "product", reference: coffee.reference, quantity: 9_999 },
      { kind: "product", reference: tea.reference, quantity: 1 },
    ]);
    items = setStorefrontCartProductQuantity(items, coffee.reference, 0);
    expect(items).toEqual([{ kind: "product", reference: tea.reference, quantity: 1 }]);
    expect(setStorefrontCartProductQuantity(items, coffee.reference, 0)).toEqual(items);
  });

  it("adds, replaces, and removes the single custom amount", () => {
    let items: StorefrontCartItem[] = [{ kind: "product", reference: coffee.reference, quantity: 1 }];
    items = setStorefrontCartCustomAmount(items, "5");
    expect(items).toEqual([
      { kind: "custom-amount", amount: "5" },
      { kind: "product", reference: coffee.reference, quantity: 1 },
    ]);
    items = setStorefrontCartCustomAmount(items, "7.25");
    expect(items).toEqual([
      { kind: "custom-amount", amount: "7.25" },
      { kind: "product", reference: coffee.reference, quantity: 1 },
    ]);
    items = setStorefrontCartCustomAmount(items, null);
    expect(items).toEqual([{ kind: "product", reference: coffee.reference, quantity: 1 }]);
  });
});

describe("storefront cart totals", () => {
  it("multiplies exact prices by quantity at the grammar scale", () => {
    const items: StorefrontCartItem[] = [
      { kind: "product", reference: coffee.reference, quantity: 3 },
      { kind: "product", reference: tea.reference, quantity: 9_999 },
    ];
    const { lines, groups } = storefrontCartTotals(items, catalog, "USD");
    expect(lines.get(items[0]!)).toBe("37.5");
    expect(lines.get(items[1]!)).toBe("0.009999");
    expect(groups).toEqual([
      { currencyCode: "BRL", total: "37.5" },
      { currencyCode: null, total: "0.009999" },
    ]);
  });

  it("groups per currency code and never sums across currencies", () => {
    const items: StorefrontCartItem[] = [
      { kind: "product", reference: coffee.reference, quantity: 1 },
      { kind: "custom-amount", amount: "5" },
      { kind: "product", reference: tea.reference, quantity: 1 },
    ];
    const { groups } = storefrontCartTotals(items, catalog, "USD");
    expect(groups).toEqual([
      { currencyCode: "BRL", total: "12.5" },
      { currencyCode: "USD", total: "5" },
      { currencyCode: null, total: "0.000001" },
    ]);
    expect(JSON.stringify(groups)).not.toContain("17.5");
  });

  it("labels the custom amount with the standalone currency code, including null", () => {
    const items: StorefrontCartItem[] = [{ kind: "custom-amount", amount: "5" }];
    expect(storefrontCartTotals(items, catalog, "BRL").groups).toEqual([{ currencyCode: "BRL", total: "5" }]);
    expect(storefrontCartTotals(items, catalog, null).groups).toEqual([{ currencyCode: null, total: "5" }]);
  });

  it("skips catalog references that disappeared after hydration", () => {
    const items: StorefrontCartItem[] = [{ kind: "product", reference: stale.reference, quantity: 2 }];
    const { lines, groups } = storefrontCartTotals(items, catalog, null);
    expect(lines.size).toBe(0);
    expect(groups).toEqual([]);
  });
});

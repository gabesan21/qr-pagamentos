import { describe, expect, it } from "vitest";

import { paginateStorefrontCatalog, STOREFRONT_PAGE_SIZE } from "./catalog-page";
import type { PublicStorefrontCatalogGroup, PublicStorefrontCatalogProduct } from "./public-storefront";

function product(index: number): PublicStorefrontCatalogProduct {
  return {
    reference: `ref-${index}`,
    title: `Product ${index}`,
    description: "",
    price: "1",
    currencyCode: "BRL",
    imageMediaIdentifier: null,
    available: true,
  };
}

function range(from: number, to: number): PublicStorefrontCatalogProduct[] {
  return Array.from({ length: to - from + 1 }, (_, offset) => product(from + offset));
}

// 13 products: 8 in "Drinks" (1-8), 5 uncategorized (9-13).
const catalog: PublicStorefrontCatalogGroup[] = [
  { name: "Drinks", products: range(1, 8) },
  { name: null, products: range(9, 13) },
];

describe("paginateStorefrontCatalog", () => {
  it("splits 13 products into a 12-product page and a 1-product page", () => {
    expect(STOREFRONT_PAGE_SIZE).toBe(12);
    const first = paginateStorefrontCatalog(catalog, 1);
    expect(first.pageCount).toBe(2);
    expect(first.groups.flatMap((group) => group.products)).toHaveLength(12);

    const second = paginateStorefrontCatalog(catalog, 2);
    expect(second.page).toBe(2);
    expect(second.groups.flatMap((group) => group.products.map((item) => item.title))).toEqual(["Product 13"]);
  });

  it("repeats a group name when the group spans the page boundary", () => {
    const spanning: PublicStorefrontCatalogGroup[] = [{ name: "Drinks", products: range(1, 13) }];
    const first = paginateStorefrontCatalog(spanning, 1);
    const second = paginateStorefrontCatalog(spanning, 2);
    expect(first.groups).toEqual([{ name: "Drinks", products: range(1, 12) }]);
    expect(second.groups).toEqual([{ name: "Drinks", products: range(13, 13) }]);
  });

  it("keeps group order and omits groups with no product on the page", () => {
    const small: PublicStorefrontCatalogGroup[] = [
      { name: "A", products: range(1, 2) },
      { name: "B", products: range(3, 4) },
      { name: null, products: range(5, 6) },
    ];
    expect(paginateStorefrontCatalog(small, 1, 2).groups.map((group) => group.name)).toEqual(["A"]);
    expect(paginateStorefrontCatalog(small, 2, 2).groups.map((group) => group.name)).toEqual(["B"]);
    expect(paginateStorefrontCatalog(small, 3, 2).groups.map((group) => group.name)).toEqual([null]);
  });

  it("clamps out-of-range and non-finite pages", () => {
    expect(paginateStorefrontCatalog(catalog, 99).page).toBe(2);
    expect(paginateStorefrontCatalog(catalog, 0).page).toBe(1);
    expect(paginateStorefrontCatalog(catalog, -3).page).toBe(1);
    expect(paginateStorefrontCatalog(catalog, Number.NaN).page).toBe(1);
  });

  it("returns a single empty page for an empty catalog", () => {
    expect(paginateStorefrontCatalog([], 5)).toEqual({ groups: [], page: 1, pageCount: 1 });
    expect(paginateStorefrontCatalog([{ name: "Empty", products: [] }], 1)).toEqual({ groups: [], page: 1, pageCount: 1 });
  });
});

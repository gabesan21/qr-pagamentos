import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({ getDatabaseClient: vi.fn() }));

import { getDatabaseClient } from "../db/client";
import { createPublicStorefrontService, getPublicStorefrontService } from "./public-storefront";

const getDatabaseClientMock = vi.mocked(getDatabaseClient);

const coffeeProductId = "11111111-1111-1111-1111-111111111111";
const teaProductId = "22222222-2222-2222-2222-222222222222";
const coffeeCategoryId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const emptyCategoryId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const inactiveCategoryId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const record = {
  storefrontDisplayNamePtBr: "Loja da Ana",
  storefrontDisplayNameEn: "Ana's store",
  storefrontAccentColor: "#106B5B",
  storefrontThemeId: "vault-blue",
  storefrontLayout: "table",
  storefrontLogoMediaIdentifier: "l".repeat(43),
  storefrontStandalonePaymentsEnabled: true,
  storefrontDefaultCurrencyCode: "USD",
  checkoutDataPolicy: "NAME_EMAIL_CPF",
  products: [
    {
      titlePtBr: "Café",
      titleEn: "Coffee",
      descriptionPtBr: "Café especial.",
      descriptionEn: "Specialty coffee.",
      price: "12.50",
      paymentLinks: [{ identifier: "AbCdEfGhIjKlMnOpQrStUvWx" }],
    },
    {
      titlePtBr: "Indisponível",
      titleEn: "Unavailable",
      descriptionPtBr: "Não deve aparecer.",
      descriptionEn: "Must not appear.",
      price: "9.00",
      paymentLinks: [],
    },
  ],
  catalog: {
    categories: [
      { id: coffeeCategoryId, namePtBr: "Cafés", nameEn: "Coffees" },
      { id: emptyCategoryId, namePtBr: "Vazia", nameEn: "Empty" },
    ],
    products: [
      {
        id: coffeeProductId,
        categoryId: coffeeCategoryId,
        titlePtBr: "Café",
        titleEn: "Coffee",
        descriptionPtBr: "Café especial.",
        descriptionEn: "Specialty coffee.",
        price: "12.50",
        currencyCode: "BRL",
        imageMediaId: "p".repeat(43),
      },
      {
        id: teaProductId,
        categoryId: inactiveCategoryId,
        titlePtBr: "Chá",
        titleEn: "Tea",
        descriptionPtBr: "Chá verde.",
        descriptionEn: "Green tea.",
        price: "9.00",
        currencyCode: null,
        imageMediaId: null,
      },
    ],
  },
} as const;

const expectedCatalogEn = [
  {
    name: "Coffees",
    products: [
      {
        reference: coffeeProductId,
        title: "Coffee",
        description: "Specialty coffee.",
        price: "12.50",
        currencyCode: "BRL",
        imageMediaIdentifier: "p".repeat(43),
        available: true,
      },
    ],
  },
  {
    name: null,
    products: [
      {
        reference: teaProductId,
        title: "Tea",
        description: "Green tea.",
        price: "9.00",
        currencyCode: "USD",
        imageMediaIdentifier: null,
        available: true,
      },
    ],
  },
] as const;

const expectedCatalogPtBr = [
  {
    name: "Cafés",
    products: [
      {
        reference: coffeeProductId,
        title: "Café",
        description: "Café especial.",
        price: "12.50",
        currencyCode: "BRL",
        imageMediaIdentifier: "p".repeat(43),
        available: true,
      },
    ],
  },
  {
    name: null,
    products: [
      {
        reference: teaProductId,
        title: "Chá",
        description: "Chá verde.",
        price: "9.00",
        currencyCode: "USD",
        imageMediaIdentifier: null,
        available: true,
      },
    ],
  },
] as const;

describe("public storefront", () => {
  it("projects only localized public product facts and one eligible checkout identifier", async () => {
    const findEnabledBySlug = vi.fn().mockResolvedValue(record);
    const service = createPublicStorefrontService({ findEnabledBySlug }, () => new Date("2026-07-21T12:00:00Z"));

    await expect(service.read("ana-store", "en")).resolves.toEqual({
      displayName: "Ana's store",
      accentColor: "#106B5B",
      themeId: "vault-blue",
      layout: "table",
      logoMediaIdentifier: "l".repeat(43),
      products: [{ title: "Coffee", description: "Specialty coffee.", price: "12.50", paymentLinkIdentifier: "AbCdEfGhIjKlMnOpQrStUvWx" }],
      catalog: expectedCatalogEn,
      standalonePayments: true,
      standalonePaymentCurrencyCode: "USD",
      checkoutDataPolicy: "NAME_EMAIL_CPF",
    });
    expect(findEnabledBySlug).toHaveBeenCalledWith("ana-store", new Date("2026-07-21T12:00:00Z"));
  });

  it("resolves design-system defaults for unset theme and layout and exposes no other settings", async () => {
    const findEnabledBySlug = vi.fn().mockResolvedValue({
      ...record,
      storefrontThemeId: null,
      storefrontLayout: null,
      storefrontLogoMediaIdentifier: null,
      storefrontStandalonePaymentsEnabled: false,
    });
    const service = createPublicStorefrontService({ findEnabledBySlug });

    const storefront = await service.read("ana-store", "pt-BR");
    expect(storefront).toEqual({
      displayName: "Loja da Ana",
      accentColor: "#106B5B",
      themeId: "pix-paper",
      layout: "boxed",
      logoMediaIdentifier: null,
      products: [{ title: "Café", description: "Café especial.", price: "12.50", paymentLinkIdentifier: "AbCdEfGhIjKlMnOpQrStUvWx" }],
      catalog: expectedCatalogPtBr,
      standalonePayments: false,
      standalonePaymentCurrencyCode: "USD",
      checkoutDataPolicy: "NAME_EMAIL_CPF",
    });
    expect(Object.keys(storefront ?? {}).sort()).toEqual([
      "accentColor",
      "catalog",
      "checkoutDataPolicy",
      "displayName",
      "layout",
      "logoMediaIdentifier",
      "products",
      "standalonePaymentCurrencyCode",
      "standalonePayments",
      "themeId",
    ]);
  });

  it("resolves the display currency from the product code, then the store default, then null", async () => {
    const findEnabledBySlug = vi.fn().mockResolvedValue({
      ...record,
      storefrontDefaultCurrencyCode: null,
      catalog: {
        categories: [],
        products: [{ ...record.catalog.products[1], categoryId: null }],
      },
    });
    const service = createPublicStorefrontService({ findEnabledBySlug });

    const storefront = await service.read("ana-store", "en");
    expect(storefront?.standalonePaymentCurrencyCode).toBeNull();
    expect(storefront?.catalog).toEqual([
      {
        name: null,
        products: [
          {
            reference: teaProductId,
            title: "Tea",
            description: "Green tea.",
            price: "9.00",
            currencyCode: null,
            imageMediaIdentifier: null,
            available: true,
          },
        ],
      },
    ]);
  });

  it("carries no owner identity, credential, provider, toggle, or internal field across the boundary", async () => {
    const findEnabledBySlug = vi.fn().mockResolvedValue(record);
    const service = createPublicStorefrontService({ findEnabledBySlug });

    const storefront = await service.read("ana-store", "pt-BR");
    expect(storefront).not.toBeNull();
    const serialized = JSON.stringify(storefront);

    // Exact member allowlists: nothing beyond the documented public DTO keys.
    for (const group of storefront?.catalog ?? []) {
      expect(Object.keys(group).sort()).toEqual(["name", "products"]);
      for (const product of group.products) {
        expect(Object.keys(product).sort()).toEqual([
          "available",
          "currencyCode",
          "description",
          "imageMediaIdentifier",
          "price",
          "reference",
          "title",
        ]);
      }
    }

    // Category identities and every inactive/internal category stay server-side.
    expect(serialized).not.toContain(coffeeCategoryId);
    expect(serialized).not.toContain(emptyCategoryId);
    expect(serialized).not.toContain(inactiveCategoryId);
    expect(serialized).not.toContain("Empty");
    expect(serialized).not.toContain("Vazia");

    // No owner identity, credential/provider data, raw toggle, or internal fields.
    for (const forbidden of [
      "ownerId",
      "owner",
      "username",
      "email",
      "credential",
      "provider",
      "nautt",
      "Uuid",
      "uuid",
      "Enabled",
      "version",
      "createdAt",
      "updatedAt",
      "archivedAt",
      "categoryId",
      "expiresAt",
      "internalName",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }

    // The 9.2.2 amendment exposes exactly the policy member (the same public
    // exposure V1 ships as `checkoutPolicy`) and nothing else about the owner.
    expect(storefront?.checkoutDataPolicy).toBe("NAME_EMAIL_CPF");
  });

  it("does not read storage for malformed or non-canonical storefront slugs", async () => {
    const findEnabledBySlug = vi.fn();
    const service = createPublicStorefrontService({ findEnabledBySlug });

    await expect(service.read("Ana Store", "pt-BR")).resolves.toBeNull();
    await expect(service.read("a".repeat(64), "pt-BR")).resolves.toBeNull();
    expect(findEnabledBySlug).not.toHaveBeenCalled();
  });

  it("returns the one opaque null for a slug the store cannot resolve", async () => {
    const findEnabledBySlug = vi.fn().mockResolvedValue(null);
    const service = createPublicStorefrontService({ findEnabledBySlug });

    await expect(service.read("unknown-store", "en")).resolves.toBeNull();
  });

  it("keeps an enabled storefront with no eligible products available as an empty store", async () => {
    const findEnabledBySlug = vi.fn().mockResolvedValue({
      ...record,
      products: [],
      catalog: { categories: [], products: [] },
    });
    const service = createPublicStorefrontService({ findEnabledBySlug });

    await expect(service.read("ana-store", "pt-BR")).resolves.toEqual({
      displayName: "Loja da Ana",
      accentColor: "#106B5B",
      themeId: "vault-blue",
      layout: "table",
      logoMediaIdentifier: "l".repeat(43),
      products: [],
      catalog: [],
      standalonePayments: true,
      standalonePaymentCurrencyCode: "USD",
      checkoutDataPolicy: "NAME_EMAIL_CPF",
    });
  });

  it("drops active categories with no catalog products and keeps group order deterministic", async () => {
    const findEnabledBySlug = vi.fn().mockResolvedValue(record);
    const service = createPublicStorefrontService({ findEnabledBySlug });

    const storefront = await service.read("ana-store", "en");
    expect(storefront?.catalog.map((group) => group.name)).toEqual(["Coffees", null]);
  });
});

describe("public storefront prisma store", () => {
  function mockDatabase(row: unknown) {
    const userFindFirst = vi.fn().mockResolvedValue(row);
    const categoryFindMany = vi.fn().mockResolvedValue([]);
    const productFindMany = vi.fn().mockResolvedValue([]);
    getDatabaseClientMock.mockReturnValue({
      user: { findFirst: userFindFirst },
      productCategory: { findMany: categoryFindMany },
      product: { findMany: productFindMany },
    } as never);
    return { userFindFirst, categoryFindMany, productFindMany };
  }

  it("reads the storefront and catalog through bounded deterministic queries", async () => {
    const { catalog, ...storefrontRow } = record;
    const ownerId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const { userFindFirst, categoryFindMany, productFindMany } = mockDatabase({ id: ownerId, ...storefrontRow });
    categoryFindMany.mockResolvedValue(catalog.categories);
    productFindMany.mockResolvedValue(catalog.products);

    const service = getPublicStorefrontService();
    const storefront = await service.read("ana-store", "en");

    expect(storefront?.catalog).toEqual(expectedCatalogEn);
    expect(storefront?.standalonePayments).toBe(true);
    expect(userFindFirst).toHaveBeenCalledWith({
      where: { storefrontSlug: "ana-store", storefrontEnabled: true },
      select: {
        id: true,
        storefrontDisplayNamePtBr: true,
        storefrontDisplayNameEn: true,
        storefrontAccentColor: true,
        storefrontThemeId: true,
        storefrontLayout: true,
        storefrontLogoMediaIdentifier: true,
        storefrontStandalonePaymentsEnabled: true,
        storefrontDefaultCurrencyCode: true,
        checkoutDataPolicy: true,
        products: {
          where: {
            active: true,
            paymentLinks: { some: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] } },
          },
          orderBy: [{ internalName: "asc" }, { id: "asc" }],
          select: {
            titlePtBr: true,
            titleEn: true,
            descriptionPtBr: true,
            descriptionEn: true,
            price: true,
            paymentLinks: {
              where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              take: 1,
              select: { identifier: true },
            },
          },
        },
      },
    });
    expect(categoryFindMany).toHaveBeenCalledWith({
      where: { ownerId, active: true },
      orderBy: [{ namePtBr: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, namePtBr: true, nameEn: true },
    });
    expect(productFindMany).toHaveBeenCalledWith({
      where: { ownerId, active: true, archivedAt: null },
      orderBy: [{ internalName: "asc" }, { id: "asc" }],
      take: 500,
      select: {
        id: true,
        categoryId: true,
        titlePtBr: true,
        titleEn: true,
        descriptionPtBr: true,
        descriptionEn: true,
        price: true,
        currencyCode: true,
        imageMediaId: true,
      },
    });
    // The owner id scopes the catalog reads and never reaches the projection.
    expect(JSON.stringify(storefront)).not.toContain(ownerId);
  });

  it("performs no catalog reads when the storefront slug does not resolve", async () => {
    const { categoryFindMany, productFindMany } = mockDatabase(null);

    const service = getPublicStorefrontService();
    await expect(service.read("unknown-store", "en")).resolves.toBeNull();
    expect(categoryFindMany).not.toHaveBeenCalled();
    expect(productFindMany).not.toHaveBeenCalled();
  });
});

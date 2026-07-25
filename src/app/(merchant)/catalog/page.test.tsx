import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";

const { requireOwnerFromCookie, resolveLocale, listProducts, listCategories, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  listProducts: vi.fn(),
  listCategories: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/product", () => ({ getProductService: () => ({ listForOwner: listProducts }) }));
vi.mock("@/auth/product-category", () => ({ getProductCategoryService: () => ({ listForOwner: listCategories }) }));

import CatalogPage from "./page";

const principal = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

const category = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  namePtBr: "Bebidas",
  nameEn: "Drinks",
  active: true,
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const product = {
  id: "660e8400-e29b-41d4-a716-446655440000",
  internalName: "Espresso",
  titlePtBr: "Café expresso",
  titleEn: "Espresso shot",
  descriptionPtBr: "Descrição",
  descriptionEn: "Description",
  price: "12.5",
  active: true,
  categoryId: category.id,
  currencyCode: "USD",
  imageMediaId: null,
  archivedAt: null,
  version: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const archived = { ...product, id: "770e8400-e29b-41d4-a716-446655440000", internalName: "Old blend", active: false, archivedAt: new Date(), imageMediaId: null };

function ready(locale: "pt-BR" | "en" = "en") {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue(locale);
}

describe("merchant catalog directory page", () => {
  it("redirects visitors without a valid session and administrators", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(CatalogPage()).rejects.toThrow("redirect:/login");
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("administrators stay out"));
    await expect(CatalogPage()).rejects.toThrow("redirect:/admin");
    expect(listProducts).not.toHaveBeenCalled();
  });

  it("renders the ready directory with localized facts, badges, and row actions", async () => {
    ready("en");
    listProducts.mockResolvedValue([product, archived]);
    listCategories.mockResolvedValue([category]);

    const markup = renderToStaticMarkup(await CatalogPage());
    expect(markup).toContain("Espresso");
    expect(markup).toContain("Espresso shot");
    expect(markup).toContain("12.5 USD");
    expect(markup).toContain("Drinks");
    expect(markup).toContain("Active");
    expect(markup).toContain("Archived");
    expect(markup).toContain(`href="/catalog/products/${product.id}"`);
    expect(markup).toContain(">Edit</a>");
    expect(markup).toContain(">View</a>");
    expect(markup).toContain('action="/catalog"');
  });

  it("renders the empty state with the create call to action", async () => {
    ready("pt-BR");
    listProducts.mockResolvedValue([]);
    listCategories.mockResolvedValue([]);

    const markup = renderToStaticMarkup(await CatalogPage());
    expect(markup).toContain("Nenhum produto ainda");
    expect(markup).toContain("/catalog/products/new");
  });

  it("renders the invalid-query state without echoing input", async () => {
    ready("en");
    listProducts.mockResolvedValue([product]);
    listCategories.mockResolvedValue([category]);

    const markup = renderToStaticMarkup(await CatalogPage({ searchParams: Promise.resolve({ bogus: "1" }) }));
    expect(markup).toContain("The directory request is unavailable");
    expect(markup).not.toContain("bogus");
  });

  it("resets non-canonical queries with a redirect before rendering", async () => {
    ready("en");
    listProducts.mockResolvedValue([product]);
    listCategories.mockResolvedValue([category]);

    await expect(CatalogPage({ searchParams: Promise.resolve({ pageSize: "25" }) })).rejects.toThrow("redirect:/catalog");
  });

  it("renders the opaque conflict notice from the repointed mutation redirect", async () => {
    ready("en");
    listProducts.mockResolvedValue([product]);
    listCategories.mockResolvedValue([category]);

    const markup = renderToStaticMarkup(await CatalogPage({ searchParams: Promise.resolve({ products: "conflict" }) }));
    expect(markup).toContain("The product changed in another request.");
  });

  it("applies search and state filters and reports the truncated set", async () => {
    ready("en");
    const many = Array.from({ length: 30 }, (_, index) => ({ ...product, id: `770e8400-e29b-41d4-a716-4466554400${String(index).padStart(2, "0")}`, internalName: `Blend ${index}` }));
    listProducts.mockResolvedValue(many);
    listCategories.mockResolvedValue([category]);

    const markup = renderToStaticMarkup(await CatalogPage({ searchParams: Promise.resolve({ "filter.state": "active" }) }));
    expect(markup).toContain("More products match the current filters.");
    expect(markup).toContain("Blend 0");
    expect(markup).not.toContain("Blend 29");

    listProducts.mockResolvedValue([product]);
    const none = renderToStaticMarkup(await CatalogPage({ searchParams: Promise.resolve({ q: "no-such-product" }) }));
    expect(none).toContain("No matching records");
  });
});

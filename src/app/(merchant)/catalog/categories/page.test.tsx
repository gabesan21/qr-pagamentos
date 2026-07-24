import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { requireOwnerFromCookie, resolveLocale, listCategories, listProducts, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  listCategories: vi.fn(),
  listProducts: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/product-category", () => ({ getProductCategoryService: () => ({ listForOwner: listCategories }) }));
vi.mock("@/auth/product", () => ({ getProductService: () => ({ listForOwner: listProducts }) }));

import CategoriesPage from "./page";

const principal = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

const drinks = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  namePtBr: "Bebidas",
  nameEn: "Drinks",
  active: true,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const food = { ...drinks, id: "550e8400-e29b-41d4-a716-446655440001", namePtBr: "Comidas", nameEn: "Food" };
const retired = { ...drinks, id: "550e8400-e29b-41d4-a716-446655440002", namePtBr: "Antiga", nameEn: "Retired", active: false };

const product = {
  id: "660e8400-e29b-41d4-a716-446655440000",
  internalName: "Espresso",
  titlePtBr: "Café expresso",
  titleEn: "Espresso shot",
  descriptionPtBr: "Descrição",
  descriptionEn: "Description",
  price: "12.50",
  active: true,
  categoryId: drinks.id,
  currencyCode: null,
  imageMediaId: null,
  archivedAt: null,
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function ready(locale: "pt-BR" | "en" = "en") {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue(locale);
}

describe("merchant catalog categories page", () => {
  it("renders the directory with inline edit, reassignment select, and edit-locked inactive rows", async () => {
    ready("en");
    listCategories.mockResolvedValue([drinks, food, retired]);
    listProducts.mockResolvedValue([product]);

    const markup = renderToStaticMarkup(await CategoriesPage());
    expect(markup).toContain("Drinks");
    expect(markup).toContain('action="/product-categories"');
    expect(markup).toContain('value="edit"');
    expect(markup).toContain('value="deactivate"');
    expect(markup).toContain('name="replacementId"');
    expect(markup).toContain("Food");
    // Each active row owns one deactivate form per responsive renderer; the
    // inactive row is badge-marked and owns no mutation control.
    expect(markup.match(/value="deactivate"/g)).toHaveLength(4);
    expect(markup).toContain("Retired");
    expect(markup).toContain("Inactive");
  });

  it("explains when deactivation is blocked by references without an active replacement", async () => {
    ready("en");
    listCategories.mockResolvedValue([drinks]);
    listProducts.mockResolvedValue([product]);

    const markup = renderToStaticMarkup(await CategoriesPage());
    expect(markup).toContain("Deactivation is unavailable while products reference this category");
    expect(markup).not.toContain('value="deactivate"');
  });

  it("renders the create card, empty state, and the opaque conflict notice", async () => {
    ready("pt-BR");
    listCategories.mockResolvedValue([]);
    listProducts.mockResolvedValue([]);

    const markup = renderToStaticMarkup(await CategoriesPage({ searchParams: Promise.resolve({ categories: "conflict" }) }));
    expect(markup).toContain("Nova categoria");
    expect(markup).toContain("Nenhuma categoria ainda");
    expect(markup).toContain("A categoria mudou em outra solicitação.");
  });
});

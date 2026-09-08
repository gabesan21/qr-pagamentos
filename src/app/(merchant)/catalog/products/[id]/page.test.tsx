import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { requireOwnerFromCookie, resolveLocale, listProducts, listCategories, listChoices, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  listProducts: vi.fn(),
  listCategories: vi.fn(),
  listChoices: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ getForOwner: () => Promise.resolve({ storefrontEnabled: false, storefrontSlug: null }) }) }));
vi.mock("@/auth/product", () => ({ getProductService: () => ({ listForOwner: listProducts }) }));
vi.mock("@/auth/product-category", () => ({ getProductCategoryService: () => ({ listForOwner: listCategories }) }));
vi.mock("@/auth/supported-exchange-currency", () => ({ getSupportedExchangeCurrencyService: () => ({ listActiveChoices: listChoices }) }));

import ProductDetailPage from "./page";

const principal = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

const product = {
  id: "660e8400-e29b-41d4-a716-446655440000",
  internalName: "Espresso",
  titlePtBr: "Café expresso",
  titleEn: "Espresso shot",
  descriptionPtBr: "Descrição",
  descriptionEn: "Description",
  price: "12.5",
  active: true,
  categoryId: null,
  currencyCode: null,
  imageMediaId: null,
  archivedAt: null,
  version: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function ready() {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue("en");
  listCategories.mockResolvedValue([]);
  listChoices.mockResolvedValue([]);
}

describe("merchant product detail page", () => {
  it("renders one opaque unavailable view for missing or cross-owner identities", async () => {
    ready();
    listProducts.mockResolvedValue([product]);

    const markup = renderToStaticMarkup(await ProductDetailPage({ params: Promise.resolve({ id: "770e8400-e29b-41d4-a716-446655440000" }) }));
    expect(markup).toContain("Product unavailable");
    expect(markup).not.toContain('action="/products"');
  });

  it("renders the edit form and archive confirmation for a live product", async () => {
    ready();
    listProducts.mockResolvedValue([product]);

    const markup = renderToStaticMarkup(await ProductDetailPage({ params: Promise.resolve({ id: product.id }) }));
    expect(markup).toContain('action="/products"');
    expect(markup).toContain('value="update"');
    expect(markup).toContain('value="archive"');
    expect(markup).toContain("Archive product permanently");
    expect(markup).toContain("Currency selection is unavailable");
    // The confirmation dialogs resolve the real lifecycle forms by id, not a
    // detached ref: both must be reachable via getElementById.
    expect(markup).toContain('id="product-active-toggle"');
    expect(markup).toContain('id="product-archive"');
  });

  it("renders archived products read-only with the terminal explanation and no mutation control", async () => {
    ready();
    listProducts.mockResolvedValue([{ ...product, active: false, archivedAt: new Date() }]);

    const markup = renderToStaticMarkup(await ProductDetailPage({ params: Promise.resolve({ id: product.id }) }));
    expect(markup).toContain("Archived");
    expect(markup).toContain("Archival is permanent");
    expect(markup).not.toContain('action="/products"');
    expect(markup).not.toContain("Archive product permanently");
    // No lingering mutation surface: no hidden action/id/version field and no
    // submitting control survives archival.
    expect(markup).not.toContain('name="action"');
    expect(markup).not.toContain('name="id"');
    expect(markup).not.toContain('name="version"');
    expect(markup).not.toContain('type="submit"');
    expect(markup).not.toContain('id="product-active-toggle"');
    expect(markup).not.toContain('id="product-archive"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { requireOwnerFromCookie, resolveLocale, listCategories, listChoices, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
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
vi.mock("@/auth/product-category", () => ({ getProductCategoryService: () => ({ listForOwner: listCategories }) }));
vi.mock("@/auth/supported-exchange-currency", () => ({ getSupportedExchangeCurrencyService: () => ({ listActiveChoices: listChoices }) }));

import NewProductPage from "./page";

const principal = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

function ready() {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue("en");
}

describe("merchant new product page", () => {
  it("renders the create form with the disabled currency explanation when no mapping exists", async () => {
    ready();
    listCategories.mockResolvedValue([]);
    listChoices.mockResolvedValue([]);

    const markup = renderToStaticMarkup(await NewProductPage());
    expect(markup).toContain('action="/products"');
    expect(markup).toContain('value="create"');
    expect(markup).toContain("Currency selection is unavailable");
    expect(markup).toContain("No exchange currency is configured");
    expect(markup).toContain("accept=\"image/jpeg,image/png,image/webp\"");
    expect(markup).toContain("4096×4096");
  });

  it("renders mapped currency choices and active categories as select options", async () => {
    ready();
    listCategories.mockResolvedValue([{ id: "550e8400-e29b-41d4-a716-446655440000", namePtBr: "Bebidas", nameEn: "Drinks", active: true, version: 0, createdAt: new Date(), updatedAt: new Date() }]);
    listChoices.mockResolvedValue([{ code: "BRL", label: "Real" }]);

    const markup = renderToStaticMarkup(await NewProductPage());
    expect(markup).toContain("BRL — Real");
    expect(markup).toContain("Bebidas / Drinks");
    expect(markup).not.toContain("Currency selection is unavailable");
  });
});

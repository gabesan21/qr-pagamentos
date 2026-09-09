import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { requireOwnerFromCookie, resolveLocale, listCategories, listChoices, getStorefrontSettings, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  listCategories: vi.fn(),
  listChoices: vi.fn(),
  getStorefrontSettings: vi.fn<() => Promise<{ storefrontEnabled: boolean; storefrontSlug: string | null; storefrontDefaultCurrencyCode: string | null }>>(
    async () => ({ storefrontEnabled: false, storefrontSlug: null, storefrontDefaultCurrencyCode: null }),
  ),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ getForOwner: getStorefrontSettings }) }));
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

  // 14.5.3 regression (fixed in c26b74c4, product-form.tsx:365): the storefront's
  // default currency is preselected in the visible field, but only the hidden
  // mirror actually reaches the create POST until the owner touches the
  // select — without it the submitted product carries no currency at all.
  it("posts the storefront's preselected currency through a hidden mirror until the select is touched", async () => {
    ready();
    listCategories.mockResolvedValue([]);
    listChoices.mockResolvedValue([{ code: "BRL", label: "Real" }, { code: "USD", label: "US dollar" }]);
    getStorefrontSettings.mockResolvedValue({ storefrontEnabled: true, storefrontSlug: "loja", storefrontDefaultCurrencyCode: "BRL" });

    const markup = renderToStaticMarkup(await NewProductPage());
    expect(markup).toContain('name="currencyCode" value="BRL"');
  });

  it("mirrors an empty value when the storefront's default currency isn't in the owner's mapped choices", async () => {
    ready();
    listCategories.mockResolvedValue([]);
    listChoices.mockResolvedValue([{ code: "USD", label: "US dollar" }]);
    getStorefrontSettings.mockResolvedValue({ storefrontEnabled: true, storefrontSlug: "loja", storefrontDefaultCurrencyCode: "BRL" });

    const markup = renderToStaticMarkup(await NewProductPage());
    expect(markup).toContain('name="currencyCode" value=""');
  });
});

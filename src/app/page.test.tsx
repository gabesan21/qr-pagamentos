import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { readStatus, resolveLocale, resolvePrincipal, listProducts, listPaymentLinks, getCheckoutPolicy, getStorefrontSettings, redirect } = vi.hoisted(() => ({
  readStatus: vi.fn(),
  resolveLocale: vi.fn(),
  resolvePrincipal: vi.fn(),
  listProducts: vi.fn(),
  listPaymentLinks: vi.fn(),
  getCheckoutPolicy: vi.fn(),
  getStorefrontSettings: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: resolvePrincipal }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/integrations/nautt/owner-onboarding", () => ({ getOwnerOnboardingService: () => ({ readStatus }) }));
vi.mock("@/auth/product", () => ({ getProductService: () => ({ listForOwner: listProducts }) }));
vi.mock("@/auth/payment-link", () => ({ getPaymentLinkService: () => ({ listForOwner: listPaymentLinks }) }));
vi.mock("@/auth/checkout-policy", () => ({ getCheckoutPolicyService: () => ({ getForOwner: getCheckoutPolicy }) }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ getForOwner: getStorefrontSettings }) }));
vi.mock("@/app/language-preference/language-preference-form", () => ({ LanguagePreferenceSubmit: ({ label }: { label: string }) => <button type="submit">{label}</button> }));

import Home from "./page";

describe("authenticated home states", () => {
  it("redirects visitors without a valid session", async () => {
    resolvePrincipal.mockResolvedValueOnce(null);
    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");
  });

  it("redirects administrators before merchant or locale work", async () => {
    resolvePrincipal.mockResolvedValueOnce({ id: "admin", role: "ADMIN" });

    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/admin");
    expect(resolveLocale).not.toHaveBeenCalled();
    expect(readStatus).not.toHaveBeenCalled();
    expect(listProducts).not.toHaveBeenCalled();
    expect(listPaymentLinks).not.toHaveBeenCalled();
    expect(getCheckoutPolicy).not.toHaveBeenCalled();
    expect(getStorefrontSettings).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "Language preference saved.", "Choose a supported language.", "Sign out"],
    ["pt-BR", "Preferência de idioma salva.", "Escolha um idioma compatível.", "Sair"],
  ] as const)("renders default, locale, success, error, and logout states in %s", async (locale, success, error, signOut) => {
    resolvePrincipal.mockResolvedValue({ id: "owner", role: "USER" });
    resolveLocale.mockResolvedValue(locale);
    readStatus.mockResolvedValue({ credential: { hasCredential: false, credentialRevision: null, webhookRegistrationState: null, updatedAt: null }, balance: null, balanceUnavailable: false });
    listProducts.mockResolvedValue([]);
    listPaymentLinks.mockResolvedValue({ links: [], activeProducts: [{ id: "product", internalName: "Donation", titlePtBr: "Doação", titleEn: "Donation", price: "1" }], activeCurrencyPairs: [{ id: "pair", label: "BRL/USDT" }] });
    getCheckoutPolicy.mockResolvedValue({ checkoutDataPolicy: "NONE" });
    getStorefrontSettings.mockResolvedValue({ storefrontSlug: "my-store", storefrontDisplayNamePtBr: null, storefrontDisplayNameEn: null, storefrontAccentColor: null, storefrontEnabled: false });

    const defaultMarkup = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) }));
    expect(defaultMarkup).toContain(`value="${locale}" selected=""`);
    expect(defaultMarkup).toContain('action="/language-preference"');
    expect(defaultMarkup).toContain('action="/logout"');
    expect(defaultMarkup).toContain(signOut);
    expect(defaultMarkup).toContain('action="/products"');
    expect(defaultMarkup).toContain('action="/payment-links"');
    expect(defaultMarkup).toContain('action="/checkout-policy"');
    expect(defaultMarkup).toContain('action="/storefront"');
    expect(defaultMarkup).toContain('value="my-store"');

    const successMarkup = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ language: "saved" }) }));
    expect(successMarkup).toContain('role="status"');
    expect(successMarkup).toContain(success);

    const errorMarkup = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ language: "error" }) }));
    expect(errorMarkup).toContain(error);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, listUsers, listSettings, listCurrencyPairs, listPaymentMethods, listProducts, resolveLocale, redirect } = vi.hoisted(() => ({
  requireAdmin: vi.fn(), listUsers: vi.fn(), listSettings: vi.fn(), listCurrencyPairs: vi.fn(), listPaymentMethods: vi.fn(), listProducts: vi.fn(), resolveLocale: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/auth/authorization", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  getAuthorizationService: () => ({ requireAdmin }),
}));
vi.mock("@/auth/administration", () => ({ getAdministrationService: () => ({ listUsers }) }));
vi.mock("@/auth/payment-settings", () => ({ getPaymentSettingsService: () => ({ list: listSettings }), SUPPORTED_CURRENCIES: ["BRL"], SUPPORTED_PAYMENT_METHODS: ["PIX"] }));
vi.mock("@/auth/nautt-catalog", () => ({ getNauttCatalogService: () => ({ listCurrencyPairs, listPaymentMethods }) }));
vi.mock("@/auth/product", () => ({ getProductService: () => ({ list: listProducts }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/i18n/dictionaries", async () => {
  const [{ en }, { ptBR }] = await Promise.all([import("../../i18n/dictionaries/en"), import("../../i18n/dictionaries/pt-BR")]);
  return { getDictionary: (locale: "en" | "pt-BR") => locale === "en" ? en : ptBR };
});
vi.mock("@/app/admin/admin-submit", () => ({ AdminSubmit: ({ label }: { label: string }) => <button disabled type="submit">{label}</button> }));

import AdminPage from "./page";

const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

describe("admin page contract", () => {
  beforeEach(() => listProducts.mockResolvedValue([]));

  it("redirects unauthenticated and non-admin visitors without rendering the shell", async () => {
    const { ForbiddenError, UnauthenticatedError } = await import("@/auth/authorization");
    requireAdmin.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");

    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/");
  });

  it("preserves unexpected authorization failures for the recovery boundary", async () => {
    const failure = new Error("database unavailable");
    requireAdmin.mockRejectedValueOnce(failure);
    await expect(AdminPage({ searchParams: Promise.resolve({}) })).rejects.toBe(failure);
  });

  it.each(["en", "pt-BR"] as const)("renders the %s dictionary with native, disabled, and empty states", async (locale) => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue(locale);
    listUsers.mockResolvedValue([]);
    listSettings.mockResolvedValue({ currencies: ["BRL"], paymentMethods: ["PIX"] });
    listCurrencyPairs.mockResolvedValue([]);
    listPaymentMethods.mockResolvedValue([]);
    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain(locale === "en" ? "Administrator accounts" : "Contas administrativas");
    expect(markup).toContain(locale === "en" ? 'aria-label="Administrator navigation"' : 'aria-label="Navegação da administração"');
    expect(markup).toContain(locale === "en" ? ">Home</a>" : ">Início</a>");
    expect(markup).toContain(locale === "en" ? "No user accounts are available." : "Nenhuma conta de usuário está disponível.");
    expect(markup).toContain('action="/admin/users"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain('name="role"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain("disabled=\"\"");
    expect(markup).toContain(locale === "en" ? "Global payment settings" : "Configurações globais de pagamento");
    expect(markup).toContain(locale === "en" ? "Nautt currency pairs" : "Pares de moedas da Nautt");
    expect(markup).toContain(locale === "en" ? "Nautt payment methods" : "Métodos de pagamento da Nautt");
    expect(markup).toContain(locale === "en" ? "No currency pairs are configured." : "Nenhum par de moedas está configurado.");
    expect(markup).toContain(locale === "en" ? "No payment methods are configured." : "Nenhum método de pagamento está configurado.");
    expect(markup).toContain(locale === "en" ? "No products are available." : "Nenhum produto está disponível.");
    expect(markup).toContain('action="/admin/catalog/currency-pairs"');
    expect(markup).toContain('action="/admin/catalog/payment-methods"');
    expect(markup).toContain('name="currencyUuid"');
    expect(markup).toContain('name="exchangeCurrencyUuid"');
    expect(markup).toContain('name="paymentMethodUuid"');
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain(`value="${locale}" selected=""`);
    expect(markup).toContain('action="/language-preference"');
    expect(markup).toContain('action="/logout"');
    expect(markup).toContain(locale === "en" ? "Sign out" : "Sair");
  });

  it("renders populated account facts and preserves every mutation route and field name", async () => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    listUsers.mockResolvedValue([admin, { ...admin, id: "user", username: "cashier", email: "cashier@example.com", role: "USER", status: "DISABLED" }]);
    listSettings.mockResolvedValue({ currencies: ["BRL"], paymentMethods: ["PIX"] });
    listCurrencyPairs.mockResolvedValue([{ id: "pair-1", label: "BRL/USDT", currencyUuid: "currency-uuid", exchangeCurrencyUuid: "exchange-uuid", active: true }]);
    listPaymentMethods.mockResolvedValue([{ id: "method-1", label: "PIX", paymentMethodUuid: "method-uuid", active: false }]);
    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ success: "changed" }) }));

    expect(markup).toContain("cashier@example.com");
    for (const action of ["/admin/users/user/role", "/admin/users/user/status", "/admin/users/user/password", "/admin/payment-settings", "/admin/catalog/currency-pairs/pair-1", "/admin/catalog/payment-methods/method-1", "/language-preference", "/logout"]) {
      expect(markup).toContain(`action="${action}"`);
    }
    for (const name of ["username", "email", "password", "role", "status", "currencies", "paymentMethods", "label", "currencyUuid", "exchangeCurrencyUuid", "paymentMethodUuid", "intent", "locale"]) {
      expect(markup).toContain(`name="${name}"`);
    }
    expect(markup).toContain('value="toggle-inactive"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Account change saved.");
  });

  it("lists products through the authorized service and maps product notices opaquely", async () => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    listUsers.mockResolvedValue([]);
    listSettings.mockResolvedValue({ currencies: ["BRL"], paymentMethods: ["PIX"] });
    listCurrencyPairs.mockResolvedValue([]);
    listPaymentMethods.mockResolvedValue([]);
    listProducts.mockResolvedValue([{ id: "product", internalName: "Donation", titlePtBr: "Doação", titleEn: "Donation", descriptionPtBr: "Linha 1\nLinha 2", descriptionEn: "Line 1\nLine 2", price: "1234.56", active: true, version: 2, createdAt: new Date(), updatedAt: new Date() }]);

    const conflict = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ error: "product-conflict" }) }));
    expect(listProducts).toHaveBeenCalledWith(admin);
    expect(conflict).toContain("The product changed in another request.");
    expect(conflict).not.toContain("product-conflict");
    expect(conflict).toContain("BRL 1,234.56");
    expect(conflict).toContain("Line 1\nLine 2");
  });

  it("announces failed mutations with an assertive alert and recovery text", async () => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    listUsers.mockResolvedValue([]);
    listSettings.mockResolvedValue({ currencies: ["BRL"], paymentMethods: ["PIX"] });
    listCurrencyPairs.mockResolvedValue([]);
    listPaymentMethods.mockResolvedValue([]);
    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ error: "change-failed" }) }));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain("Review the details and try again.");
  });

  it.each([
    ["en", "Account change saved.", "The catalog change could not be saved. Review the values and try again."],
    ["pt-BR", "Alteração da conta salva.", "Não foi possível salvar a alteração do catálogo. Revise os valores e tente novamente."],
  ] as const)("renders deterministic success and recovery states in %s", async (locale, success, recovery) => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue(locale);
    listUsers.mockResolvedValue([]);
    listSettings.mockResolvedValue({ currencies: ["BRL"], paymentMethods: ["PIX"] });
    listCurrencyPairs.mockResolvedValue([]);
    listPaymentMethods.mockResolvedValue([]);

    const successMarkup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ success: "changed" }) }));
    expect(successMarkup).toContain('role="status"');
    expect(successMarkup).toContain(success);

    const errorMarkup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ error: "catalog-change-failed" }) }));
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toContain(recovery);
  });
});

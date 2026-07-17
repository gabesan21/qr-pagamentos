import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { requireAdmin, listUsers, listSettings, resolveLocale, redirect } = vi.hoisted(() => ({
  requireAdmin: vi.fn(), listUsers: vi.fn(), listSettings: vi.fn(), resolveLocale: vi.fn(),
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
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/i18n/dictionaries", async () => {
  const [{ en }, { ptBR }] = await Promise.all([import("../../i18n/dictionaries/en"), import("../../i18n/dictionaries/pt-BR")]);
  return { getDictionary: (locale: "en" | "pt-BR") => locale === "en" ? en : ptBR };
});
vi.mock("@/app/admin/admin-submit", () => ({ AdminSubmit: ({ label }: { label: string }) => <button disabled type="submit">{label}</button> }));

import AdminPage from "./page";

const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

describe("admin page contract", () => {
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
    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ success: "changed" }) }));

    expect(markup).toContain("cashier@example.com");
    for (const action of ["/admin/users/user/role", "/admin/users/user/status", "/admin/users/user/password", "/admin/payment-settings", "/language-preference", "/logout"]) {
      expect(markup).toContain(`action="${action}"`);
    }
    for (const name of ["username", "email", "password", "role", "status", "currencies", "paymentMethods", "locale"]) {
      expect(markup).toContain(`name="${name}"`);
    }
    expect(markup).toContain('role="status"');
    expect(markup).toContain("Account change saved.");
  });

  it("announces failed mutations with an assertive alert and recovery text", async () => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    listUsers.mockResolvedValue([]);
    listSettings.mockResolvedValue({ currencies: ["BRL"], paymentMethods: ["PIX"] });
    const markup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ error: "change-failed" }) }));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain("Review the details and try again.");
  });

  it.each([
    ["en", "Account change saved.", "Review the details and try again."],
    ["pt-BR", "Alteração da conta salva.", "Revise os dados e tente novamente."],
  ] as const)("renders deterministic success and recovery states in %s", async (locale, success, recovery) => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue(locale);
    listUsers.mockResolvedValue([]);
    listSettings.mockResolvedValue({ currencies: ["BRL"], paymentMethods: ["PIX"] });

    const successMarkup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ success: "changed" }) }));
    expect(successMarkup).toContain('role="status"');
    expect(successMarkup).toContain(success);

    const errorMarkup = renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve({ error: "change-failed" }) }));
    expect(errorMarkup).toContain('role="alert"');
    expect(errorMarkup).toContain(recovery);
  });
});

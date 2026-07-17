import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { readStatus, resolveLocale, resolvePrincipal, redirect } = vi.hoisted(() => ({
  readStatus: vi.fn(),
  resolveLocale: vi.fn(),
  resolvePrincipal: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: resolvePrincipal }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/integrations/nautt/owner-onboarding", () => ({ getOwnerOnboardingService: () => ({ readStatus }) }));
vi.mock("@/app/language-preference/language-preference-form", () => ({ LanguagePreferenceSubmit: ({ label }: { label: string }) => <button type="submit">{label}</button> }));

import Home from "./page";

describe("authenticated home states", () => {
  it("redirects visitors without a valid session", async () => {
    resolvePrincipal.mockResolvedValueOnce(null);
    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");
  });

  it.each([
    ["en", "Language preference saved.", "Choose a supported language.", "Sign out"],
    ["pt-BR", "Preferência de idioma salva.", "Escolha um idioma compatível.", "Sair"],
  ] as const)("renders default, locale, success, error, and logout states in %s", async (locale, success, error, signOut) => {
    resolvePrincipal.mockResolvedValue({ id: "admin" });
    resolveLocale.mockResolvedValue(locale);
    readStatus.mockResolvedValue({ credential: { hasCredential: false, credentialRevision: null, webhookRegistrationState: null, updatedAt: null }, balance: null, balanceUnavailable: false });

    const defaultMarkup = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({}) }));
    expect(defaultMarkup).toContain(`value="${locale}" selected=""`);
    expect(defaultMarkup).toContain('action="/language-preference"');
    expect(defaultMarkup).toContain('action="/logout"');
    expect(defaultMarkup).toContain(signOut);

    const successMarkup = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ language: "saved" }) }));
    expect(successMarkup).toContain('role="status"');
    expect(successMarkup).toContain(success);

    const errorMarkup = renderToStaticMarkup(await Home({ searchParams: Promise.resolve({ language: "error" }) }));
    expect(errorMarkup).toContain(error);
  });
});

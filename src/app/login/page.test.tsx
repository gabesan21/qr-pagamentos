import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { readCookie } = vi.hoisted(() => ({ readCookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: readCookie }) }));

import { getDictionary } from "@/i18n/dictionaries";
import LoginPage from "./page";

describe("login page contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readCookie.mockReturnValue(undefined);
  });

  it("preserves the unprefixed username/password form and generic recovery", async () => {
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ error: "invalid-credentials" }) }));

    expect(markup).toContain('action="/login/submit"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain('for="username"');
    expect(markup).toContain('id="username"');
    expect(markup).toContain('autoComplete="username"');
    expect(markup).toContain('for="password"');
    expect(markup).toContain('id="password"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-brand-identity="product-lockup"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain("Nome de usuário ou senha inválidos.");
    expect(markup).not.toContain("database unavailable");
    expect(markup).toContain('class="auth-card__panel"');
    expect(markup).toContain('class="auth-card__form login-form"');
  });

  it("composes the page exclusively from the approved shared inventory", async () => {
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="field-group"');
    expect(markup).toContain('data-slot="field"');
    expect(markup).toContain('data-slot="input"');
    expect(markup).toContain('data-slot="button"');
    expect(markup).not.toContain('<input id="username"');
    expect(markup).not.toContain('<button type="submit"');
  });

  it("permits only the six owned UI sources and no login-local visual primitive", () => {
    const allowedSources = new Set(["alert", "button", "card", "field", "input", "spinner"]);
    const requiredExports = ["Alert", "Button", "Card", "Field", "Input", "Spinner"];
    const importPattern = /import\s+(?:type\s+)?([^;]+?)\s+from\s+"([^"]+)"/g;
    const files = ["page.tsx", "login-submit.tsx", "totp-challenge-form.tsx"];
    const importedNames = new Set<string>();

    for (const file of files) {
      const source = readFileSync(join(import.meta.dirname, file), "utf8");
      for (const match of source.matchAll(importPattern)) {
        const [, clause, specifier] = match;
        if (specifier.startsWith("@/components/ui/")) {
          expect(allowedSources.has(specifier.slice("@/components/ui/".length))).toBe(true);
          for (const name of clause.replaceAll(/[{}]/g, "").split(",")) {
            const imported = name.trim().split(/\s+as\s+/)[0];
            if (imported) importedNames.add(imported);
          }
        } else if (specifier === "@/brand/brand-identity") {
          expect(file).toBe("page.tsx");
        } else if (specifier.startsWith(".")) {
          expect(["./login-submit", "./totp-challenge-form"]).toContain(specifier);
          expect(file).toBe("page.tsx");
        }
      }
    }

    for (const required of requiredExports) {
      expect(importedNames.has(required)).toBe(true);
    }
  });

  it.each(["pt-BR", "en"] as const)("keeps the %s login copy complete", (locale) => {
    const dictionary = getDictionary(locale);

    expect(dictionary.loginHeading).not.toBe("");
    expect(dictionary.loginIntroduction).not.toBe("");
    expect(dictionary.signIn).not.toBe("");
    expect(dictionary.signingIn).not.toBe("");
    expect(dictionary.invalidCredentials).not.toBe("");
  });

  it.each(["pt-BR", "en"] as const)("renders the password-changed completion in the persisted %s preference", async (locale) => {
    readCookie.mockReturnValue({ value: locale });
    const dictionary = getDictionary(locale);
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ password: "changed" }) }));

    expect(markup).toContain(dictionary.passwordChangedSuccess);
    expect(markup).toContain(dictionary.loginHeading);
  });

  it("fails closed to pt-BR for an unsupported signed-out locale cookie", async () => {
    readCookie.mockReturnValue({ value: "es" });
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ password: "changed" }) }));

    expect(markup).toContain(getDictionary("pt-BR").passwordChangedSuccess);
  });

  it.each(["pt-BR", "en"] as const)("renders the MFA challenge form when required in %s", async (locale) => {
    readCookie.mockReturnValue({ value: locale });
    const dictionary = getDictionary(locale);
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ mfa: "required" }) }));

    expect(markup).toContain(dictionary.mfaHeading);
    expect(markup).toContain('action="/login/totp-challenge"');
    expect(markup).toContain('id="mfa-code"');
    expect(markup).toContain('autoComplete="one-time-code"');
    expect(markup).toContain(dictionary.mfaCodeLabel);
    expect(markup).toContain(dictionary.mfaRecoveryLink);
  });

  it.each(["pt-BR", "en"] as const)("renders the failed MFA alert opaquely in %s", async (locale) => {
    readCookie.mockReturnValue({ value: locale });
    const dictionary = getDictionary(locale);
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ mfa: "failed" }) }));

    expect(markup).toContain(dictionary.mfaFailed);
    expect(markup).toContain('action="/login/totp-challenge"');
  });
});

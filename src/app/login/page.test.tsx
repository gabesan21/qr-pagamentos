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
    expect(markup).toContain('class="auth-card__form"');
  });

  it("renders the show/hide toggle, forgot-password link, and inline required copy", async () => {
    const dictionary = getDictionary("pt-BR");
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain('class="auth-password-field__toggle"');
    expect(markup).toContain(`aria-label="${dictionary.showPassword}"`);
    expect(markup).toContain('href="/reset-password"');
    expect(markup).toContain(dictionary.forgotPassword);
    expect(markup).toContain(dictionary.forgotPasswordNote);
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
    const allowedSources = new Set(["alert", "button", "card", "field", "input", "input-otp", "spinner"]);
    const requiredExports = ["Alert", "Button", "CardContent", "Field", "Input", "InputOTP", "Spinner"];
    const importPattern = /import\s+(?:type\s+)?([^;]+?)\s+from\s+"([^"]+)"/g;
    const files = ["page.tsx", "login-form.tsx", "login-submit.tsx", "totp-challenge-form.tsx"];
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
          expect(["page.tsx", "login-form.tsx"]).toContain(file);
        } else if (specifier.startsWith(".")) {
          if (file === "page.tsx") {
            expect(["./login-form", "./totp-challenge-form"]).toContain(specifier);
          } else if (file === "login-form.tsx") {
            expect(specifier).toBe("./login-submit");
          } else {
            throw new Error(`unexpected relative import ${specifier} in ${file}`);
          }
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
    expect(markup).toContain('id="mfa-totp-code"');
    expect(markup).toContain('autoComplete="one-time-code"');
    expect(markup).toContain(dictionary.mfaCodeLabel);
    expect(markup).toContain(dictionary.mfaRecoveryLink);
    // Six owned InputOTP slots, digits-only pattern, and the Back link —
    // the retired single text box never comes back.
    expect(markup.match(/data-slot="input-otp-slot"/g)).toHaveLength(6);
    expect(markup).toContain('pattern="^\\d+$"');
    expect(markup).toContain('href="/login"');
    expect(markup).toContain(dictionary.backToCredentials);
    expect(markup).not.toContain('type="text" id="mfa-code"');
  });

  it.each(["pt-BR", "en"] as const)("renders the failed MFA alert opaquely in %s", async (locale) => {
    readCookie.mockReturnValue({ value: locale });
    const dictionary = getDictionary(locale);
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({ mfa: "failed" }) }));

    expect(markup).toContain(dictionary.mfaFailed);
    expect(markup).toContain('action="/login/totp-challenge"');
  });

  it("renders the labelled PT/EN language switcher posting to /language-preference, ≥44px, with no principal read added", async () => {
    const markup = renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain('action="/language-preference"');
    expect(markup).toContain('name="locale"');
    expect(markup).toMatch(/aria-label="[^"]+"/);
    expect(markup).toContain(">PT<");
    expect(markup).toContain(">EN<");
    expect(markup).toContain("h-11");
    expect(readCookie).not.toHaveBeenCalledWith("qr_session");
  });
});

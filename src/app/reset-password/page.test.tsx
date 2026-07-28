import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { readCookie } = vi.hoisted(() => ({ readCookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: readCookie }) }));

const { validateResetChallenge } = vi.hoisted(() => ({ validateResetChallenge: vi.fn() }));
vi.mock("@/auth/password-reset", () => ({ getPasswordResetService: () => ({ validateResetChallenge }) }));

import { getDictionary } from "@/i18n/dictionaries";
import ResetPasswordPage from "./page";

describe("reset password page contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readCookie.mockReturnValue(undefined);
    validateResetChallenge.mockResolvedValue({ id: "owner" });
  });

  it("renders the password reset form for a valid token", async () => {
    const markup = renderToStaticMarkup(await ResetPasswordPage({ searchParams: Promise.resolve({ token: "valid-token" }) }));

    expect(markup).toContain('action="/reset-password/submit"');
    expect(markup).toContain('method="post"');
    expect(markup).toContain('name="token"');
    expect(markup).toContain('value="valid-token"');
    expect(markup).toContain('for="newPassword"');
    expect(markup).toContain('id="newPassword"');
    expect(markup).toContain('name="newPassword"');
    expect(markup).toContain('for="confirmation"');
    expect(markup).toContain('id="confirmation"');
    expect(markup).toContain('name="confirmation"');
    expect(markup).toContain('type="password"');
    expect(markup).not.toContain(getDictionary("pt-BR").resetPasswordTokenInvalid);
  });

  it("shows an opaque unavailable message for a missing token", async () => {
    validateResetChallenge.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await ResetPasswordPage({ searchParams: Promise.resolve({}) }));

    expect(markup).toContain(getDictionary("pt-BR").resetPasswordTokenInvalid);
    expect(markup).not.toContain('action="/reset-password/submit"');
  });

  it("shows an opaque unavailable message for an invalid token", async () => {
    validateResetChallenge.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await ResetPasswordPage({ searchParams: Promise.resolve({ token: "invalid-token" }) }));

    expect(validateResetChallenge).toHaveBeenCalledWith("invalid-token");
    expect(markup).toContain(getDictionary("pt-BR").resetPasswordTokenInvalid);
    expect(markup).not.toContain('name="newPassword"');
  });

  it("shows the failure alert when the route reports an error", async () => {
    const markup = renderToStaticMarkup(await ResetPasswordPage({ searchParams: Promise.resolve({ token: "valid-token", error: "failed" }) }));

    expect(markup).toContain(getDictionary("pt-BR").resetPasswordFailed);
    expect(markup).toContain('action="/reset-password/submit"');
  });

  it("composes the page exclusively from the approved shared inventory", async () => {
    const markup = renderToStaticMarkup(await ResetPasswordPage({ searchParams: Promise.resolve({ token: "valid-token" }) }));

    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="field-group"');
    expect(markup).toContain('data-slot="field"');
    expect(markup).toContain('data-slot="input"');
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain('data-brand-identity="product-lockup"');
  });

  it.each(["pt-BR", "en"] as const)("renders the %s copy for the public reset form", (locale) => {
    const dictionary = getDictionary(locale);

    expect(dictionary.resetPasswordHeading).not.toBe("");
    expect(dictionary.resetPasswordIntroduction).not.toBe("");
    expect(dictionary.resetPasswordNewPasswordLabel).not.toBe("");
    expect(dictionary.resetPasswordConfirmPasswordLabel).not.toBe("");
    expect(dictionary.resetPasswordSubmit).not.toBe("");
    expect(dictionary.resetPasswordSubmitting).not.toBe("");
    expect(dictionary.resetPasswordTokenInvalid).not.toBe("");
    expect(dictionary.resetPasswordFailed).not.toBe("");
  });

  it("renders the reset form in the persisted locale preference", async () => {
    readCookie.mockReturnValue({ value: "en" });
    const dictionary = getDictionary("en");

    const markup = renderToStaticMarkup(await ResetPasswordPage({ searchParams: Promise.resolve({ token: "valid-token" }) }));

    expect(markup).toContain(dictionary.resetPasswordHeading);
    expect(markup).toContain(dictionary.resetPasswordNewPasswordLabel);
  });

  it("permits only the six owned UI sources and no page-local visual primitive", () => {
    const allowedSources = new Set(["alert", "button", "card", "field", "input", "spinner"]);
    const requiredExports = ["Alert", "Button", "Card", "Field", "Input", "Spinner"];
    const importPattern = /import\s+(?:type\s+)?([^;]+?)\s+from\s+"([^"]+)"/g;
    const files = ["page.tsx", "reset-password-submit.tsx"];
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
          expect(specifier).toBe("./reset-password-submit");
          expect(file).toBe("page.tsx");
        }
      }
    }

    for (const required of requiredExports) {
      expect(importedNames.has(required)).toBe(true);
    }
  });
});

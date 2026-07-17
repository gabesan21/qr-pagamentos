import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";
import LoginPage from "./page";

describe("login page contract", () => {
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
    expect(markup).toContain("Nome de usuário ou senha inválidos.");
    expect(markup).not.toContain("database unavailable");
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
    const files = ["page.tsx", "login-submit.tsx"];
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
        } else if (specifier.startsWith(".")) {
          expect(specifier).toBe("./login-submit");
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
});

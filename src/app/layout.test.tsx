import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { resolvePrincipal, resolveLocale } = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  resolveLocale: vi.fn(),
}));
const cookieStore: Record<string, string> = {};

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name in cookieStore ? { value: cookieStore[name] } : undefined) }),
}));
vi.mock("../auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: resolvePrincipal }) }));
vi.mock("../i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));

import RootLayout from "./layout";

const principal = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

function resetCookies(next: Readonly<Record<string, string>>) {
  for (const key of Object.keys(cookieStore)) delete cookieStore[key];
  Object.assign(cookieStore, next);
}

describe("RootLayout theme stamping", () => {
  it("stamps data-theme from a valid cookie for a resolved principal", async () => {
    resetCookies({ qr_session: "opaque", qr_theme: "vault-blue" });
    resolvePrincipal.mockResolvedValueOnce(principal);
    resolveLocale.mockResolvedValueOnce("en");

    const markup = renderToStaticMarkup(await RootLayout({ children: <div /> }));
    expect(markup).toContain('data-theme="vault-blue"');
  });

  it("stamps nothing for an unknown theme value", async () => {
    resetCookies({ qr_session: "opaque", qr_theme: "not-a-theme" });
    resolvePrincipal.mockResolvedValueOnce(principal);
    resolveLocale.mockResolvedValueOnce("en");

    const markup = renderToStaticMarkup(await RootLayout({ children: <div /> }));
    expect(markup).not.toContain("data-theme=");
  });

  it("stamps nothing for an absent principal, even with a theme cookie present", async () => {
    resetCookies({ qr_theme: "vault-blue" });
    resolvePrincipal.mockResolvedValueOnce(null);

    const markup = renderToStaticMarkup(await RootLayout({ children: <div /> }));
    expect(markup).not.toContain("data-theme=");
  });

  it("stamps nothing for a resolved principal with no theme cookie", async () => {
    resetCookies({ qr_session: "opaque" });
    resolvePrincipal.mockResolvedValueOnce(principal);
    resolveLocale.mockResolvedValueOnce("en");

    const markup = renderToStaticMarkup(await RootLayout({ children: <div /> }));
    expect(markup).not.toContain("data-theme=");
  });
});

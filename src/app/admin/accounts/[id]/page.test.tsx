import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { AdminUserDetail } from "@/auth/admin-user-directory";

const { requireAdminFromCookie, resolveLocale, getDetail, listActiveCurrencyChoices, redirect } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  getDetail: vi.fn(),
  listActiveCurrencyChoices: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/admin-user-directory", async (importActual) => ({
  ...(await importActual<typeof import("@/auth/admin-user-directory")>()),
  getAdminUserDirectoryService: () => ({ getAdminUserDetail: getDetail }),
}));
vi.mock("@/auth/admin-user-profile", async (importActual) => ({
  ...(await importActual<typeof import("@/auth/admin-user-profile")>()),
  getAdminUserProfileService: () => ({ listActiveCurrencyChoices }),
}));

import AdminAccountDetailPage from "./page";

const admin = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const targetId = "440e8400-e29b-41d4-a716-446655440010";

function detail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: targetId,
    username: "merchant.one",
    email: "merchant.one@example.com",
    role: "USER",
    status: "ACTIVE",
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    deletedAt: null,
    state: "active",
    storeState: "active",
    lastActivityAt: new Date("2026-07-24T12:00:00.000Z"),
    storefrontSlug: "padaria",
    editor: {
      profileVersion: 7,
      preferredLocale: "en",
      checkoutDataPolicy: "NAME_EMAIL",
      storefrontEnabled: true,
      storefrontDisplayNamePtBr: "Padaria",
      storefrontDisplayNameEn: "Bakery",
      storefrontAccentColor: "#AA00FF",
      storefrontThemeId: "pix-paper",
      storefrontLayout: "boxed",
      storefrontStandalonePaymentsEnabled: false,
      storefrontDefaultCurrencyCode: "BRL",
    },
    ...overrides,
  };
}

function render(id: string, searchParams: Record<string, string> = {}) {
  return AdminAccountDetailPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminFromCookie.mockResolvedValue(admin);
  resolveLocale.mockResolvedValue("en");
  getDetail.mockResolvedValue(detail());
  listActiveCurrencyChoices.mockResolvedValue([{ code: "BRL", label: "Brazilian real" }]);
});

describe("administrator account editor page", () => {
  it("redirects visitors without a valid session and merchants before any read", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(render(targetId)).rejects.toThrow("redirect:/login");
    requireAdminFromCookie.mockRejectedValueOnce(new ForbiddenError("merchants stay out"));
    await expect(render(targetId)).rejects.toThrow("redirect:/");
    expect(getDetail).not.toHaveBeenCalled();
  });

  it("passes the resolved principal and the raw route identity into the delivered read", async () => {
    renderToStaticMarkup(await render("440E8400-E29B-41D4-A716-446655440010"));
    expect(getDetail).toHaveBeenCalledWith(admin, "440E8400-E29B-41D4-A716-446655440010");
  });

  it("renders the read-only facts with every editor section and the delivered routes", async () => {
    const markup = renderToStaticMarkup(await render(targetId));
    expect(markup).toContain("merchant.one");
    expect(markup).toContain("merchant.one@example.com");
    expect(markup).toContain(">User<");
    expect(markup).toContain("Active");
    expect(markup).toContain("Active store");
    expect(markup).toContain("padaria");
    expect(markup).toContain('href="/admin/accounts"');
    // Identity CAS form carries the hidden expected version.
    expect(markup).toContain(`action="/admin/users/${targetId}/identity"`);
    expect(markup).toContain('name="expectedVersion"');
    expect(markup).toContain('value="7"');
    // The re-housed legacy forms post the byte-frozen routes.
    expect(markup).toContain(`action="/admin/users/${targetId}/role"`);
    expect(markup).toContain(`action="/admin/users/${targetId}/status"`);
    expect(markup).toContain(`action="/admin/users/${targetId}/password"`);
    // Locale, checkout policy, and storefront forms post the new routes.
    expect(markup).toContain(`action="/admin/users/${targetId}/locale"`);
    expect(markup).toContain(`action="/admin/users/${targetId}/checkout-policy"`);
    expect(markup).toContain(`action="/admin/users/${targetId}/storefront"`);
    expect(markup).toContain(`action="/admin/users/${targetId}/delete"`);
    // The safe public-store link points at the sessionless storefront route.
    expect(markup).toContain('href="/store/padaria"');
    // The owner-fenced logo media field never renders.
    expect(markup).not.toContain("storefrontLogoMediaIdentifier");
    expect(markup).not.toContain("Logo");
  });

  it("renders the current editable values as form defaults", async () => {
    const markup = renderToStaticMarkup(await render(targetId));
    expect(markup).toContain('value="merchant.one"');
    expect(markup).toContain('value="merchant.one@example.com"');
    expect(markup).toContain('value="Padaria"');
    expect(markup).toContain('value="#AA00FF"');
    expect(markup).toContain("Brazilian real (BRL)");
    expect(listActiveCurrencyChoices).toHaveBeenCalledWith(admin);
  });

  it("renders the explicit store-unavailable state without a link when disabled or slugless", async () => {
    getDetail.mockResolvedValue(detail({
      storeState: "configured",
      editor: { ...detail().editor, storefrontEnabled: false },
    }));
    const disabled = renderToStaticMarkup(await render(targetId));
    expect(disabled).toContain("The public store is unavailable");
    expect(disabled).not.toContain('href="/store/');
  });

  it.each(["changed", "conflict", "failed"])("renders the closed %s notice", async (value) => {
    const markup = renderToStaticMarkup(await render(targetId, { editor: value }));
    const expected = value === "changed"
      ? "Account change saved."
      : value === "conflict"
        ? "conflicts with a newer state"
        : "could not be completed";
    expect(markup).toContain(expected);
  });

  it("renders no notice for absent or unknown editor values", async () => {
    const markup = renderToStaticMarkup(await render(targetId, { editor: "forged" }));
    expect(markup).not.toContain("Account change saved.");
    expect(markup).not.toContain("forged");
  });

  it("keeps the deleted account read-only with the badge and no editor form", async () => {
    getDetail.mockResolvedValue(detail({
      username: "gone.owner",
      status: "DISABLED",
      deletedAt: new Date("2026-07-20T00:00:00.000Z"),
      state: "deleted",
      storeState: "none",
      storefrontSlug: null,
      lastActivityAt: null,
    }));
    const markup = renderToStaticMarkup(await render(targetId));
    expect(markup).toContain("gone.owner");
    expect(markup).toContain(">Deleted</");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("/identity");
    expect(markup).not.toContain("/role");
    expect(markup).not.toContain("/status");
    expect(markup).not.toContain("/locale");
    expect(markup).not.toContain("/checkout-policy");
    expect(markup).not.toContain("/storefront");
    expect(markup).not.toContain("/delete");
    expect(listActiveCurrencyChoices).not.toHaveBeenCalled();
  });

  it("renders localized pt-BR copy", async () => {
    resolveLocale.mockResolvedValue("pt-BR");
    const markup = renderToStaticMarkup(await render(targetId));
    expect(markup).toContain("Slug da vitrine");
    expect(markup).toContain("Voltar às contas");
    expect(markup).toContain(">Excluir<");
    expect(markup).toContain("Salvar identidade");
    expect(markup).toContain("Salvar vitrine");
    expect(markup).toContain("Ver a loja pública");
  });

  it("shares the one opaque unavailable outcome for missing and malformed identities", async () => {
    getDetail.mockResolvedValue(null);
    const missing = renderToStaticMarkup(await render("440e8400-e29b-41d4-a716-446655440099"));
    expect(missing).toContain("This account is unavailable");
    expect(missing).not.toContain("merchant.one");
    expect(missing).not.toContain("/delete");

    const malformed = renderToStaticMarkup(await render("not-a-user"));
    expect(malformed).toContain("This account is unavailable");
    expect(malformed).not.toContain("not-a-user");
    expect(listActiveCurrencyChoices).not.toHaveBeenCalled();
  });
});

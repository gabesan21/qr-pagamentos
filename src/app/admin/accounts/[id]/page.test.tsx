import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { AdminUserDetail } from "@/auth/admin-user-directory";

const { requireAdminFromCookie, resolveLocale, getDetail, listActiveCurrencyChoices, redirect, getTotpStatus } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  getDetail: vi.fn(),
  listActiveCurrencyChoices: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
  getTotpStatus: vi.fn((): Promise<"none" | "pending" | "active"> => Promise.resolve("none")),
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
vi.mock("@/auth/totp-store", () => ({ getTotpService: () => ({ getStatus: getTotpStatus }) }));

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

  it("renders the read-only header facts, the five tabs, and the default identity tab's delivered route", async () => {
    const markup = renderToStaticMarkup(await render(targetId));
    expect(markup).toContain("merchant.one");
    expect(markup).toContain(">User<");
    expect(markup).toContain(">Active<");
    expect(markup).toContain('href="/admin/accounts"');
    // Five tabs: Identity, Access, Storefront, Preferences, Danger zone.
    expect(markup).toContain(">Identity<");
    expect(markup).toContain(">Access<");
    expect(markup).toContain(">Storefront<");
    expect(markup).toContain(">Preferences<");
    expect(markup).toContain(">Danger zone<");
    // Identity is the default panel server-rendered before hydration; its CAS
    // form carries the hidden expected version and current field defaults.
    expect(markup).toContain(`action="/admin/users/${targetId}/identity"`);
    expect(markup).toContain('name="expectedVersion"');
    expect(markup).toContain('value="7"');
    expect(markup).toContain('value="merchant.one"');
    expect(markup).toContain('value="merchant.one@example.com"');
    // The other four tabs' panels do not force-mount before hydration, so
    // their routes and fields are covered by their own component tests
    // (access-section, storefront-section, preferences-section,
    // danger-section) rather than duplicated here.
    expect(listActiveCurrencyChoices).toHaveBeenCalledWith(admin);
  });

  it("resolves TOTP configuration once per render regardless of which tab is later opened", async () => {
    getTotpStatus.mockResolvedValueOnce("active");
    await render(targetId);
    expect(getTotpStatus).toHaveBeenCalledWith(targetId);
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

  it.each(["requested", "failed"])("renders the closed reset %s notice", async (value) => {
    const markup = renderToStaticMarkup(await render(targetId, { reset: value }));
    const expected = value === "requested"
      ? "Reset email sent."
      : "The reset email could not be sent";
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

  it("renders localized pt-BR copy for the header, tabs, and default identity panel", async () => {
    resolveLocale.mockResolvedValue("pt-BR");
    const markup = renderToStaticMarkup(await render(targetId));
    expect(markup).toContain('href="/admin/accounts">Contas de usuário</a>');
    expect(markup).toContain(">Identidade<");
    expect(markup).toContain(">Acesso<");
    expect(markup).toContain(">Vitrine<");
    expect(markup).toContain(">Preferências<");
    expect(markup).toContain("Salvar identidade");
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

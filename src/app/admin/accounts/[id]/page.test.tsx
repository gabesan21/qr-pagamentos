import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { AdminUserDetail } from "@/auth/admin-user-directory";

const { requireAdminFromCookie, resolveLocale, getDetail, redirect } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  getDetail: vi.fn(),
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

import AdminAccountDetailPage from "./page";

const admin = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

function detail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: "440e8400-e29b-41d4-a716-446655440010",
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
    ...overrides,
  };
}

function render(id: string) {
  return AdminAccountDetailPage({ params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminFromCookie.mockResolvedValue(admin);
  resolveLocale.mockResolvedValue("en");
  getDetail.mockResolvedValue(detail());
});

describe("administrator account detail page", () => {
  it("redirects visitors without a valid session and merchants before any read", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(render("440e8400-e29b-41d4-a716-446655440010")).rejects.toThrow("redirect:/login");
    requireAdminFromCookie.mockRejectedValueOnce(new ForbiddenError("merchants stay out"));
    await expect(render("440e8400-e29b-41d4-a716-446655440010")).rejects.toThrow("redirect:/");
    expect(getDetail).not.toHaveBeenCalled();
  });

  it("passes the resolved principal and the raw route identity into the delivered read", async () => {
    renderToStaticMarkup(await render("440E8400-E29B-41D4-A716-446655440010"));
    expect(getDetail).toHaveBeenCalledWith(admin, "440E8400-E29B-41D4-A716-446655440010");
  });

  it("renders the read-only facts with the delete form as the only action", async () => {
    const markup = renderToStaticMarkup(await render("440e8400-e29b-41d4-a716-446655440010"));
    expect(markup).toContain("merchant.one");
    expect(markup).toContain("merchant.one@example.com");
    expect(markup).toContain(">User<");
    expect(markup).toContain("Active");
    expect(markup).toContain("Active store");
    expect(markup).toContain("padaria");
    expect(markup).toContain('action="/admin/users/440e8400-e29b-41d4-a716-446655440010/delete"');
    expect(markup).toContain('href="/admin/accounts"');
    // Read-only: the legacy role/status/password mutation forms never render.
    expect(markup).not.toContain('/role');
    expect(markup).not.toContain('/status');
    expect(markup).not.toContain('name="password"');
  });

  it("keeps the deleted account viewable with the badge and without the delete form", async () => {
    getDetail.mockResolvedValue(detail({
      username: "gone.owner",
      status: "DISABLED",
      deletedAt: new Date("2026-07-20T00:00:00.000Z"),
      state: "deleted",
      storeState: "none",
      storefrontSlug: null,
      lastActivityAt: null,
    }));
    const markup = renderToStaticMarkup(await render("440e8400-e29b-41d4-a716-446655440010"));
    expect(markup).toContain("gone.owner");
    expect(markup).toContain(">Deleted</");
    expect(markup).toContain("Not provided");
    expect(markup).toContain("Never");
    expect(markup).not.toContain('/delete');
  });

  it("renders localized pt-BR copy", async () => {
    resolveLocale.mockResolvedValue("pt-BR");
    const markup = renderToStaticMarkup(await render("440e8400-e29b-41d4-a716-446655440010"));
    expect(markup).toContain("Slug da vitrine");
    expect(markup).toContain("Voltar às contas");
    expect(markup).toContain(">Excluir<");
  });

  it("shares the one opaque unavailable outcome for missing and malformed identities", async () => {
    getDetail.mockResolvedValue(null);
    const missing = renderToStaticMarkup(await render("440e8400-e29b-41d4-a716-446655440099"));
    expect(missing).toContain("This account is unavailable");
    expect(missing).not.toContain("merchant.one");
    expect(missing).not.toContain('/delete');

    const malformed = renderToStaticMarkup(await render("not-a-user"));
    expect(malformed).toContain("This account is unavailable");
    expect(malformed).not.toContain("not-a-user");
  });
});

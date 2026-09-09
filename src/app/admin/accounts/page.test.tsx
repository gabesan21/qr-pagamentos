import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { AdminUserSummary } from "@/auth/admin-user-directory";

const { requireAdminFromCookie, resolveLocale, queryDirectory, redirect } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  queryDirectory: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/admin-user-directory", async (importActual) => ({
  ...(await importActual<typeof import("@/auth/admin-user-directory")>()),
  queryAdminUserDirectory: (...args: unknown[]) => queryDirectory(...args),
}));

import AdminAccountsPage from "./page";

const admin = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

function row(overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
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
    ...overrides,
  };
}

function ready(locale: "pt-BR" | "en" = "en", rows: AdminUserSummary[] = [row()]) {
  requireAdminFromCookie.mockResolvedValue(admin);
  resolveLocale.mockResolvedValue(locale);
  queryDirectory.mockResolvedValue({ status: "ready", rows, pageSize: 50 });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("administrator accounts directory page", () => {
  it("redirects visitors without a valid session and merchants before any read", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(AdminAccountsPage()).rejects.toThrow("redirect:/login");
    requireAdminFromCookie.mockRejectedValueOnce(new ForbiddenError("merchants stay out"));
    await expect(AdminAccountsPage()).rejects.toThrow("redirect:/");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("preserves unexpected authorization failures for the recovery boundary", async () => {
    const failure = new Error("database unavailable");
    requireAdminFromCookie.mockRejectedValueOnce(failure);
    await expect(AdminAccountsPage()).rejects.toBe(failure);
  });

  it("renders the ready directory with the create-account section and without the legacy mutation forms", async () => {
    ready("en", [
      row(),
      row({
        id: "440e8400-e29b-41d4-a716-446655440011",
        username: "gone.owner",
        email: null,
        status: "DISABLED",
        deletedAt: new Date("2026-07-20T00:00:00.000Z"),
        state: "deleted",
        storeState: "none",
        lastActivityAt: null,
      }),
    ]);

    const markup = renderToStaticMarkup(await AdminAccountsPage());
    expect(markup).toContain("User directory");
    // Create moved into a header modal, closed by default; its trigger is
    // the only always-visible surface — the form itself is covered by
    // create-account-modal.test.tsx (byte-identical action/method/fields).
    expect(markup).toContain(">Create account<");
    // Row facts: usernames, email redaction fallback, role/state/store facts.
    expect(markup).toContain("merchant.one");
    expect(markup).toContain("merchant.one@example.com");
    expect(markup).toContain("gone.owner");
    expect(markup).toContain("Not provided");
    expect(markup).toContain(">User<");
    expect(markup).toContain(">Active<");
    expect(markup).toContain("Active store");
    expect(markup).toContain("No store");
    expect(markup).toContain("Never");
    // The deleted row keeps its place with the localized non-color badge and
    // carries no edit/delete actions.
    expect(markup).toContain(">Deleted</");
    expect(markup).toContain('href="/admin/accounts/440e8400-e29b-41d4-a716-446655440010"');
    expect(markup).toContain('action="/admin/users/440e8400-e29b-41d4-a716-446655440010/delete"');
    // The delete action is a real POST form gated by DestructiveActionForm's
    // confirmation dialog, not a bare link or an inert placeholder.
    expect(markup).toContain('action="/admin/users/440e8400-e29b-41d4-a716-446655440010/delete" method="post"');
    expect(markup).not.toContain('href="/admin/accounts/440e8400-e29b-41d4-a716-446655440011"');
    expect(markup).not.toContain('action="/admin/users/440e8400-e29b-41d4-a716-446655440011/delete"');
    // The legacy inline role/status/password forms retired from the page;
    // their byte-frozen routes are never linked here.
    expect(markup).not.toContain('/role');
    expect(markup).not.toContain('/status');
    expect(markup).not.toContain('/password');
  });

  it("renders localized pt-BR copy including the deleted badge", async () => {
    ready("pt-BR", [
      row(),
      row({
        id: "440e8400-e29b-41d4-a716-446655440011",
        username: "gone.owner",
        deletedAt: new Date("2026-07-20T00:00:00.000Z"),
        status: "DISABLED",
        state: "deleted",
      }),
    ]);
    const markup = renderToStaticMarkup(await AdminAccountsPage());
    expect(markup).toContain("Diretório de usuários");
    expect(markup).toContain(">Excluída</");
    expect(markup).toContain(">Editar<");
    expect(markup).toContain(">Excluir<");
  });

  it("renders the empty and filtered-empty states", async () => {
    ready("en", []);
    const markup = renderToStaticMarkup(await AdminAccountsPage());
    expect(markup).toContain("No accounts yet");

    const filtered = renderToStaticMarkup(await AdminAccountsPage({ searchParams: Promise.resolve({ q: "no-such-user" }) }));
    expect(filtered).toContain("No matching records");
  });

  it("resets to the reset redirect without directory I/O and without echoing input", async () => {
    ready("en");
    await expect(AdminAccountsPage({ searchParams: Promise.resolve({ forged: "1" }) })).rejects.toThrow("redirect:/admin/accounts?filters=ignored");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("resets to the reset redirect for a forged notice without directory I/O", async () => {
    ready("en");
    await expect(AdminAccountsPage({ searchParams: Promise.resolve({ success: "deleted" }) })).rejects.toThrow("redirect:/admin/accounts?filters=ignored");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("resets to the reset redirect when the delivered service rejects a calendar day", async () => {
    ready("en");
    queryDirectory.mockResolvedValue({ status: "invalid-query" });

    await expect(AdminAccountsPage({ searchParams: Promise.resolve({ "filter.from": "2026-13-99" }) })).rejects.toThrow("redirect:/admin/accounts?filters=ignored");
  });

  it("renders the delivered notice strip inside a canonical query", async () => {
    ready("en");
    const created = renderToStaticMarkup(await AdminAccountsPage({ searchParams: Promise.resolve({ success: "created" }) }));
    expect(created).toContain("Account created.");
    const failed = renderToStaticMarkup(await AdminAccountsPage({ searchParams: Promise.resolve({ error: "create-failed" }) }));
    expect(failed).toContain("The account could not be created. Review the details and try again.");
  });

  it("resets non-canonical queries before any read", async () => {
    ready("en");
    await expect(AdminAccountsPage({ searchParams: Promise.resolve({ pageSize: "50" }) })).rejects.toThrow("redirect:/admin/accounts");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("renders the error state when the directory read fails", async () => {
    ready("en");
    queryDirectory.mockRejectedValue(new Error("database unavailable"));
    const markup = renderToStaticMarkup(await AdminAccountsPage());
    expect(markup).toContain("The directory could not be loaded");
  });

  it("passes the canonical target into the delivered directory service and renders pagination URLs", async () => {
    requireAdminFromCookie.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    queryDirectory.mockResolvedValue({ status: "ready", rows: [row()], pageSize: 20, nextCursor: "next-token", previousCursor: "previous-token" });

    const markup = renderToStaticMarkup(await AdminAccountsPage({
      searchParams: Promise.resolve({ q: "merchant", "filter.role": "USER", pageSize: "20" }),
    }));
    expect(queryDirectory).toHaveBeenCalledWith("/admin/accounts?q=merchant&filter.role=USER&pageSize=20");
    expect(markup).toContain("cursor=next-token");
    expect(markup).toContain("cursor=previous-token");
    expect(markup).toContain("pageSize=20");
  });

  it("requests the registered default size of 50 on the bare URL", async () => {
    ready("en");
    renderToStaticMarkup(await AdminAccountsPage());
    expect(queryDirectory).toHaveBeenCalledWith("/admin/accounts");
  });
});

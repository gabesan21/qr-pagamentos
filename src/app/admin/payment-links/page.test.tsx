import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { AdminPaymentLinkV2DirectoryRow } from "@/auth/payment-link-v2-admin-directory";

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
vi.mock("@/auth/payment-link-v2-admin-directory", async (importActual) => ({
  ...(await importActual<typeof import("@/auth/payment-link-v2-admin-directory")>()),
  queryAdminPaymentLinkV2Directory: (...args: unknown[]) => queryDirectory(...args),
}));

import AdminPaymentLinksPage from "./page";

const admin = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

function row(overrides: Partial<AdminPaymentLinkV2DirectoryRow> = {}): AdminPaymentLinkV2DirectoryRow {
  return {
    id: "440e8400-e29b-41d4-a716-446655440010",
    identifier: "abcdefghijklmnopqrstuvwx",
    sharePath: "/pay/abcdefghijklmnopqrstuvwx",
    compositionKind: "FIXED_AMOUNT",
    descriptionPtBr: "Doação mensal",
    descriptionEn: "Monthly donation",
    amount: "34.90",
    currencyPairLabel: "BRL/USDT",
    linkType: "REUSABLE",
    expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    active: true,
    paid: true,
    orderCount: 3,
    state: "paid",
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    lines: [],
    owner: { username: "merchant.one", deletedAt: null },
    ...overrides,
  };
}

function ready(locale: "pt-BR" | "en" = "en", rows: AdminPaymentLinkV2DirectoryRow[] = [row()]) {
  requireAdminFromCookie.mockResolvedValue(admin);
  resolveLocale.mockResolvedValue(locale);
  queryDirectory.mockResolvedValue({ status: "ready", rows, pageSize: 50 });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("administrator payment-links directory page", () => {
  it("redirects visitors without a valid session and merchants before any read", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(AdminPaymentLinksPage()).rejects.toThrow("redirect:/login");
    requireAdminFromCookie.mockRejectedValueOnce(new ForbiddenError("merchants stay out"));
    await expect(AdminPaymentLinksPage()).rejects.toThrow("redirect:/");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("preserves unexpected authorization failures for the recovery boundary", async () => {
    const failure = new Error("database unavailable");
    requireAdminFromCookie.mockRejectedValueOnce(failure);
    await expect(AdminPaymentLinksPage()).rejects.toBe(failure);
  });

  it("renders the ready global directory with owner attribution and no mutation surface", async () => {
    ready("en", [
      row(),
      row({
        id: "440e8400-e29b-41d4-a716-446655440011",
        identifier: "zyxwvutsrqponmlkjihgfedcba",
        sharePath: "/pay/zyxwvutsrqponmlkjihgfedcba",
        compositionKind: "PRODUCT_LINES",
        descriptionPtBr: null,
        descriptionEn: null,
        amount: null,
        linkType: "SINGLE_USE",
        expiresAt: null,
        active: false,
        paid: false,
        orderCount: 0,
        state: "inactive",
        lines: [{ position: 1, quantity: 2, titlePtBr: "Café", titleEn: "Coffee", unitPrice: "17.45" }],
        owner: { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") },
      }),
    ]);

    const markup = renderToStaticMarkup(await AdminPaymentLinksPage());
    expect(markup).toContain("Global payment-link directory");
    // Owner attribution: usernames link to the interim accounts surface, and
    // the soft-deleted owner keeps its row with the localized badge.
    expect(markup).toContain('href="/admin/accounts"');
    expect(markup).toContain("merchant.one");
    expect(markup).toContain("gone.owner");
    expect(markup).toContain(">Deleted</");
    // Both renderers (ruled facts and table) carry the badge; CSS leaves
    // exactly one in the accessibility tree, and only the deleted owner has it.
    expect(markup.match(/>Deleted</g)).toHaveLength(2);
    // Directory facts from the owner projection: identifier, amount for the
    // fixed-amount link, and the localized product count for the other.
    expect(markup).toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).toContain("1 products");
    expect(markup).toContain(">Fixed amount</");
    expect(markup).toContain(">Product lines</");
    expect(markup).toContain(">Reusable</");
    expect(markup).toContain(">Single use</");
    expect(markup).toContain(">Paid</");
    expect(markup).toContain(">Inactive</");
    expect(markup).toContain(">No expiry</");
    expect(markup).toContain('href="/admin/payment-links/v2/440e8400-e29b-41d4-a716-446655440010"');
    expect(markup).toContain('action="/admin/payment-links"');
    // Read-only: no share affordance, no owner mutation link, no POST form.
    expect(markup).not.toContain("/pay/abcdefghijklmnopqrstuvwx\"");
    expect(markup).not.toContain("/links/v2/");
    expect(markup).not.toContain('method="post"');
  });

  it("renders localized pt-BR copy including the deleted badge", async () => {
    ready("pt-BR", [row({ owner: { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") } })]);
    const markup = renderToStaticMarkup(await AdminPaymentLinksPage());
    expect(markup).toContain("Diretório global de links de pagamento");
    expect(markup).toContain(">Pago</");
    expect(markup).toContain(">Excluída</");
  });

  it("renders the empty and filtered-empty states", async () => {
    ready("en", []);
    const markup = renderToStaticMarkup(await AdminPaymentLinksPage());
    expect(markup).toContain("No payment links yet");

    const filtered = renderToStaticMarkup(await AdminPaymentLinksPage({ searchParams: Promise.resolve({ q: "no-such-link" }) }));
    expect(filtered).toContain("No matching records");
  });

  it("resets to the reset redirect without directory I/O and without echoing input", async () => {
    ready("en");
    await expect(AdminPaymentLinksPage({ searchParams: Promise.resolve({ forged: "1" }) })).rejects.toThrow("redirect:/admin/payment-links?filters=ignored");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("resets to the reset redirect when the delivered service rejects a calendar day", async () => {
    ready("en");
    queryDirectory.mockResolvedValue({ status: "invalid-query" });

    await expect(AdminPaymentLinksPage({ searchParams: Promise.resolve({ "filter.from": "2026-13-99" }) })).rejects.toThrow("redirect:/admin/payment-links?filters=ignored");
  });

  it("resets non-canonical queries before any read", async () => {
    ready("en");
    await expect(AdminPaymentLinksPage({ searchParams: Promise.resolve({ pageSize: "50" }) })).rejects.toThrow("redirect:/admin/payment-links");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("renders the error state when the directory read fails", async () => {
    ready("en");
    queryDirectory.mockRejectedValue(new Error("database unavailable"));
    const markup = renderToStaticMarkup(await AdminPaymentLinksPage());
    expect(markup).toContain("The directory could not be loaded");
  });

  it("passes the canonical target into the delivered directory service and renders pagination URLs", async () => {
    requireAdminFromCookie.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    queryDirectory.mockResolvedValue({ status: "ready", rows: [row()], pageSize: 20, nextCursor: "next-token", previousCursor: "previous-token" });

    const markup = renderToStaticMarkup(await AdminPaymentLinksPage({
      searchParams: Promise.resolve({ q: "donation", "filter.state": "paid", pageSize: "20" }),
    }));
    expect(queryDirectory).toHaveBeenCalledWith("/admin/payment-links?q=donation&filter.state=paid&pageSize=20");
    expect(markup).toContain("cursor=next-token");
    expect(markup).toContain("cursor=previous-token");
    expect(markup).toContain("pageSize=20");
  });

  it("requests the registered default size of 50 on the bare URL", async () => {
    ready("en");
    renderToStaticMarkup(await AdminPaymentLinksPage());
    expect(queryDirectory).toHaveBeenCalledWith("/admin/payment-links");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { AdminOrderV2Summary } from "@/orders/order-v2-admin-directory";

const { requireAdminFromCookie, resolveLocale, listForAdmin, queryDirectory, redirect } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  listForAdmin: vi.fn(),
  queryDirectory: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/orders/order-view", () => ({ getOrderViewService: () => ({ listForAdmin }) }));
vi.mock("@/app/admin/product-management", () => ({ formatProductPrice: (price: string) => `BRL ${price}` }));
vi.mock("@/orders/order-v2-admin-directory", async (importActual) => ({
  ...(await importActual<typeof import("@/orders/order-v2-admin-directory")>()),
  queryAdminOrderV2Directory: (...args: unknown[]) => queryDirectory(...args),
}));

import AdminOrdersPage from "./page";

const admin = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

const v1Order = {
  id: "440e8400-e29b-41d4-a716-446655440044",
  paymentLinkIdentifier: "link-identifier",
  productTitlePtBr: "Doação",
  productTitleEn: "Donation",
  amount: "10.50",
  currencyPairLabel: "BRL/USDT",
  state: "PENDING" as const,
  checkoutDataPolicy: "NONE" as const,
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
  updatedAt: new Date("2026-07-02T12:00:00.000Z"),
  settledAt: null,
};

function row(overrides: Partial<AdminOrderV2Summary> = {}): AdminOrderV2Summary {
  return {
    id: "440e8400-e29b-41d4-a716-446655440010",
    source: "LINK",
    paymentLinkV2Identifier: "abcdefghijklmnopqrstuvwx",
    amount: "34.90",
    currencyUuid: "990e8400-e29b-41d4-a716-446655440099",
    exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa",
    descriptionPtBr: "Doação mensal",
    descriptionEn: "Monthly donation",
    state: "CONFIRMED",
    currentLocalOutcome: null,
    checkoutDataPolicy: "NAME_EMAIL",
    payer: { name: "Ana", email: "ana@example.com", cpf: null, address: null },
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    settledAt: new Date("2026-07-02T12:00:00.000Z"),
    owner: { username: "merchant.one", deletedAt: null },
    ...overrides,
  };
}

function ready(locale: "pt-BR" | "en" = "en", rows: AdminOrderV2Summary[] = [row()]) {
  requireAdminFromCookie.mockResolvedValue(admin);
  resolveLocale.mockResolvedValue(locale);
  listForAdmin.mockResolvedValue([v1Order]);
  queryDirectory.mockResolvedValue({ status: "ready", rows, pageSize: 50 });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("administrator orders directory page", () => {
  it("redirects visitors without a valid session and merchants before any read", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(AdminOrdersPage()).rejects.toThrow("redirect:/login");
    requireAdminFromCookie.mockRejectedValueOnce(new ForbiddenError("merchants stay out"));
    await expect(AdminOrdersPage()).rejects.toThrow("redirect:/");
    expect(listForAdmin).not.toHaveBeenCalled();
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("preserves unexpected authorization failures for the recovery boundary", async () => {
    const failure = new Error("database unavailable");
    requireAdminFromCookie.mockRejectedValueOnce(failure);
    await expect(AdminOrdersPage()).rejects.toBe(failure);
  });

  it("renders the ready global directory with owner attribution above the untouched V1 ledger", async () => {
    ready("en", [
      row(),
      row({
        id: "440e8400-e29b-41d4-a716-446655440011",
        source: "AD_HOC",
        paymentLinkV2Identifier: null,
        state: null,
        currentLocalOutcome: { outcome: "LOCAL_FINALIZED", note: null, createdAt: new Date("2026-07-02T12:00:00.000Z") },
        payer: { name: null, email: null, cpf: null, address: null },
        owner: { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") },
      }),
    ]);

    const markup = renderToStaticMarkup(await AdminOrdersPage());
    expect(listForAdmin).toHaveBeenCalledWith(admin);
    expect(markup).toContain("Global order directory");
    // Owner attribution: usernames link to the interim accounts surface, and
    // the soft-deleted owner keeps its row with the localized badge.
    expect(markup).toContain('href="/admin/accounts"');
    expect(markup).toContain("merchant.one");
    expect(markup).toContain("gone.owner");
    expect(markup).toContain(">Deleted</");
    // Both renderers (ruled facts and table) carry the badge; CSS leaves
    // exactly one in the accessibility tree, and only the deleted owner has it.
    expect(markup.match(/>Deleted</g)).toHaveLength(2);
    // Payer facts and badges from the summary projection.
    expect(markup).toContain("Ana");
    expect(markup).toContain("ana@example.com");
    expect(markup).toContain("Not collected");
    expect(markup).toContain(">Payment confirmed</");
    expect(markup).toContain(">No payment</");
    expect(markup).toContain(">Locally finalized</");
    expect(markup).toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).toContain(">No link</");
    expect(markup).toContain('href="/admin/orders/v2/440e8400-e29b-41d4-a716-446655440010"');
    expect(markup).toContain('action="/admin/orders"');
    // Redaction: currency pair UUIDs never render.
    expect(markup).not.toContain("990e8400-e29b-41d4-a716-446655440099");
    expect(markup).not.toContain("aa0e8400-e29b-41d4-a716-4466554400aa");
    // The byte-frozen V1 ledger below, with its own detail route.
    expect(markup).toContain("Single-product orders");
    expect(markup).toContain("Donation");
    expect(markup).toContain('href="/admin/orders/440e8400-e29b-41d4-a716-446655440044"');
  });

  it("renders localized pt-BR copy including the deleted badge", async () => {
    ready("pt-BR", [row({ owner: { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") } })]);
    const markup = renderToStaticMarkup(await AdminOrdersPage());
    expect(markup).toContain("Diretório global de pedidos");
    expect(markup).toContain("Pedidos de produto único");
    expect(markup).toContain(">Pagamento confirmado</");
    expect(markup).toContain(">Excluída</");
  });

  it("renders the empty and filtered-empty states", async () => {
    ready("en", []);
    const markup = renderToStaticMarkup(await AdminOrdersPage());
    expect(markup).toContain("No orders yet");

    const filtered = renderToStaticMarkup(await AdminOrdersPage({ searchParams: Promise.resolve({ q: "no-such-order" }) }));
    expect(filtered).toContain("No matching records");
  });

  it("renders the invalid-query state without directory I/O and without echoing input", async () => {
    ready("en");
    const markup = renderToStaticMarkup(await AdminOrdersPage({ searchParams: Promise.resolve({ forged: "1" }) }));
    expect(markup).toContain("The directory request is unavailable");
    expect(markup).not.toContain("forged");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("renders the invalid-query state when the delivered service rejects a calendar day", async () => {
    ready("en");
    queryDirectory.mockResolvedValue({ status: "invalid-query" });

    const markup = renderToStaticMarkup(await AdminOrdersPage({ searchParams: Promise.resolve({ "filter.from": "2026-13-99" }) }));
    expect(markup).toContain("The directory request is unavailable");
    expect(markup).not.toContain("2026-13-99");
  });

  it("resets non-canonical queries before any read", async () => {
    ready("en");
    await expect(AdminOrdersPage({ searchParams: Promise.resolve({ pageSize: "50" }) })).rejects.toThrow("redirect:/admin/orders");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("renders the error state when the directory read fails while the V1 section stays", async () => {
    ready("en");
    queryDirectory.mockRejectedValue(new Error("database unavailable"));
    const markup = renderToStaticMarkup(await AdminOrdersPage());
    expect(markup).toContain("The directory could not be loaded");
    expect(markup).toContain("Single-product orders");
  });

  it("passes the canonical target into the delivered directory service and renders pagination URLs", async () => {
    requireAdminFromCookie.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    listForAdmin.mockResolvedValue([]);
    queryDirectory.mockResolvedValue({ status: "ready", rows: [row()], pageSize: 20, nextCursor: "next-token", previousCursor: "previous-token" });

    const markup = renderToStaticMarkup(await AdminOrdersPage({
      searchParams: Promise.resolve({ q: "donation", "filter.source": "LINK", pageSize: "20" }),
    }));
    expect(queryDirectory).toHaveBeenCalledWith("/admin/orders?q=donation&filter.source=LINK&pageSize=20");
    expect(markup).toContain("cursor=next-token");
    expect(markup).toContain("cursor=previous-token");
    expect(markup).toContain("pageSize=20");
  });

  it("requests the registered default size of 50 on the bare URL", async () => {
    ready("en");
    renderToStaticMarkup(await AdminOrdersPage());
    expect(queryDirectory).toHaveBeenCalledWith("/admin/orders");
  });
});

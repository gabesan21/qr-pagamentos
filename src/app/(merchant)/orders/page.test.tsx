import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { OrderV2Summary } from "@/orders/order-v2-view";

const { requireOwnerFromCookie, resolveLocale, listV1, queryDirectory, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  listV1: vi.fn(),
  queryDirectory: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/orders/order-view", () => ({ getOrderViewService: () => ({ listForOwner: listV1 }) }));
vi.mock("@/app/admin/product-management", () => ({ formatProductPrice: (price: string) => `BRL ${price}` }));
vi.mock("@/orders/order-v2-directory", async (importActual) => ({
  ...(await importActual<typeof import("@/orders/order-v2-directory")>()),
  queryOwnerOrderV2Directory: (...args: unknown[]) => queryDirectory(...args),
}));

import MerchantOrdersPage from "./page";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

const v1Order = {
  id: "440e8400-e29b-41d4-a716-446655440044",
  paymentLinkIdentifier: "link-identifier",
  productTitlePtBr: "Doação",
  productTitleEn: "Donation",
  amount: "10.50",
  currencyPairLabel: "BRL/USDT",
  state: "CONFIRMED" as const,
  checkoutDataPolicy: "NAME_EMAIL" as const,
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
  updatedAt: new Date("2026-07-02T12:00:00.000Z"),
  settledAt: new Date("2026-07-02T12:00:00.000Z"),
};

function row(overrides: Partial<OrderV2Summary> = {}): OrderV2Summary {
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
    ...overrides,
  };
}

function ready(locale: "pt-BR" | "en" = "en", rows: OrderV2Summary[] = [row()]) {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue(locale);
  listV1.mockResolvedValue([v1Order]);
  queryDirectory.mockResolvedValue({ status: "ready", rows, pageSize: 20 });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("merchant orders directory page", () => {
  it("redirects visitors without a valid session and administrators before any read", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(MerchantOrdersPage()).rejects.toThrow("redirect:/login");
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("administrators stay out"));
    await expect(MerchantOrdersPage()).rejects.toThrow("redirect:/admin");
    expect(listV1).not.toHaveBeenCalled();
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("renders the ready directory with payer facts, badges, and the untouched V1 legacy section", async () => {
    ready("en", [
      row(),
      row({ id: "440e8400-e29b-41d4-a716-446655440011", source: "AD_HOC", paymentLinkV2Identifier: null, state: null, currentLocalOutcome: { outcome: "LOCAL_FINALIZED", note: null, createdAt: new Date("2026-07-02T12:00:00.000Z") }, payer: { name: null, email: null, cpf: null, address: null } }),
      row({ id: "440e8400-e29b-41d4-a716-446655440012", state: "REJECTED", currentLocalOutcome: { outcome: "LOCAL_CANCELLED", note: null, createdAt: new Date("2026-07-03T12:00:00.000Z") } }),
      row({ id: "440e8400-e29b-41d4-a716-446655440013", source: "STANDALONE", paymentLinkV2Identifier: null, state: "PENDING", payer: { name: "Carlos", email: null, cpf: null, address: null } }),
    ]);

    const markup = renderToStaticMarkup(await MerchantOrdersPage());
    expect(markup).toContain("Ana");
    expect(markup).toContain("ana@example.com");
    expect(markup).toContain("Not collected");
    expect(markup).toContain(">Payment confirmed</");
    expect(markup).toContain(">Payment rejected</");
    expect(markup).toContain(">No payment</");
    expect(markup).toContain(">Locally finalized</");
    expect(markup).toContain(">Locally cancelled</");
    expect(markup).toContain(">No local outcome</");
    expect(markup).toContain(">Ad hoc</");
    expect(markup).toContain(">Standalone payment</");
    expect(markup).toContain("Carlos");
    expect(markup).toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).toContain(">No link</");
    expect(markup).toContain('href="/orders/v2/440e8400-e29b-41d4-a716-446655440010"');
    expect(markup).toContain('action="/orders"');
    expect(markup).not.toContain("990e8400-e29b-41d4-a716-446655440099");
    // The byte-frozen V1 ledger below, with its own detail route.
    expect(markup).toContain("Single-product orders");
    expect(markup).toContain("Donation");
    expect(markup).toContain("BRL 10.50");
    expect(markup).toContain('href="/orders/440e8400-e29b-41d4-a716-446655440044"');
  });

  it("renders localized pt-BR copy", async () => {
    ready("pt-BR");
    const markup = renderToStaticMarkup(await MerchantOrdersPage());
    expect(markup).toContain("Pedidos de produto único");
    expect(markup).toContain(">Pagamento confirmado</");
    expect(markup).toContain(">Link de pagamento</");
    expect(markup).toContain("Doação");
  });

  it("renders the empty and filtered-empty states", async () => {
    ready("en", []);
    const markup = renderToStaticMarkup(await MerchantOrdersPage());
    expect(markup).toContain("No orders yet");
    expect(markup).toContain('href="/links/new"');

    const filtered = renderToStaticMarkup(await MerchantOrdersPage({ searchParams: Promise.resolve({ q: "no-such-order" }) }));
    expect(filtered).toContain("No matching records");
  });

  it("resets to the reset redirect without directory I/O and without echoing input", async () => {
    ready("en");
    await expect(MerchantOrdersPage({ searchParams: Promise.resolve({ forged: "1" }) })).rejects.toThrow("redirect:/orders?filters=ignored");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("resets to the reset redirect when the delivered service rejects a calendar day", async () => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    listV1.mockResolvedValue([]);
    queryDirectory.mockResolvedValue({ status: "invalid-query" });

    await expect(MerchantOrdersPage({ searchParams: Promise.resolve({ "filter.from": "2026-13-99" }) })).rejects.toThrow("redirect:/orders?filters=ignored");
  });

  it("resets non-canonical queries before any read", async () => {
    ready("en");
    await expect(MerchantOrdersPage({ searchParams: Promise.resolve({ pageSize: "20" }) })).rejects.toThrow("redirect:/orders");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("renders the error state when the directory read fails while the V1 section stays", async () => {
    ready("en");
    queryDirectory.mockRejectedValue(new Error("database unavailable"));
    const markup = renderToStaticMarkup(await MerchantOrdersPage());
    expect(markup).toContain("The directory could not be loaded");
    expect(markup).toContain("Single-product orders");
  });

  it("passes the canonical target into the delivered directory service and renders pagination URLs", async () => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    listV1.mockResolvedValue([]);
    queryDirectory.mockResolvedValue({ status: "ready", rows: [row()], pageSize: 50, nextCursor: "next-token", previousCursor: "previous-token" });

    const markup = renderToStaticMarkup(await MerchantOrdersPage({
      searchParams: Promise.resolve({ q: "donation", "filter.source": "LINK", pageSize: "50" }),
    }));
    expect(queryDirectory).toHaveBeenCalledWith("/orders?q=donation&filter.source=LINK&pageSize=50");
    expect(markup).toContain("cursor=next-token");
    expect(markup).toContain("cursor=previous-token");
    expect(markup).toContain("pageSize=50");
  });

  it("renders each closed outcome notice in both locales and rejects a forged notice before any read", async () => {
    ready("en");
    const commented = renderToStaticMarkup(await MerchantOrdersPage({ searchParams: Promise.resolve({ "orders-v2": "commented" }) }));
    expect(commented).toContain("The comment was added.");

    ready("pt-BR");
    for (const [notice, copy] of [
      ["comment-edited", "O comentário foi atualizado."],
      ["outcome-set", "O resultado local foi registrado."],
    ] as const) {
      const markup = renderToStaticMarkup(await MerchantOrdersPage({ searchParams: Promise.resolve({ "orders-v2": notice }) }));
      expect(markup).toContain(copy);
    }

    ready("en");
    const failed = renderToStaticMarkup(await MerchantOrdersPage({ searchParams: Promise.resolve({ "orders-v2": "failed" }) }));
    expect(failed).toContain("The order change could not be saved.");

    await expect(MerchantOrdersPage({ searchParams: Promise.resolve({ "orders-v2": "deleted" }) })).rejects.toThrow("redirect:/orders?filters=ignored");
    expect(queryDirectory).toHaveBeenCalledTimes(4);
  });
});

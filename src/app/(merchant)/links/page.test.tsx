import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { PaymentLinkV2DirectoryRow, PaymentLinkV2OwnerCurrencyPairOption } from "@/auth/payment-link-v2-view";

const { requireOwnerFromCookie, resolveLocale, listV1, queryDirectory, listOwnerActiveCurrencyPairs, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  listV1: vi.fn(),
  queryDirectory: vi.fn(),
  listOwnerActiveCurrencyPairs: vi.fn<() => Promise<PaymentLinkV2OwnerCurrencyPairOption[]>>(async () => []),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect, useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ getForOwner: () => Promise.resolve({ storefrontEnabled: false, storefrontSlug: null }) }) }));
vi.mock("@/auth/payment-link", () => ({ getPaymentLinkService: () => ({ listForOwner: listV1 }) }));
vi.mock("@/auth/payment-link-v2-view", async (importActual) => ({
  ...(await importActual<typeof import("@/auth/payment-link-v2-view")>()),
  getPaymentLinkV2DirectoryAdapter: () => ({ readWindow: vi.fn() }),
  listOwnerActiveCurrencyPairs,
}));
vi.mock("@/data-directory/server/directory-page", async (importActual) => ({
  ...(await importActual<typeof import("@/data-directory/server/directory-page")>()),
  queryMerchantDirectory: (...args: unknown[]) => queryDirectory(...args),
}));

import MerchantLinksPage from "./page";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

function row(overrides: Partial<PaymentLinkV2DirectoryRow> = {}): PaymentLinkV2DirectoryRow {
  return {
    id: "440e8400-e29b-41d4-a716-446655440010",
    identifier: "abcdefghijklmnopqrstuvwx",
    sharePath: "/pay/abcdefghijklmnopqrstuvwx",
    compositionKind: "FIXED_AMOUNT",
    descriptionPtBr: "Doação mensal",
    descriptionEn: "Monthly donation",
    amount: "10.50",
    currencyPairLabel: "BRL/USDT",
    linkType: "REUSABLE",
    expiresAt: null,
    active: true,
    paid: false,
    orderCount: 2,
    state: "active",
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    lines: [],
    ...overrides,
  };
}

function ready(locale: "pt-BR" | "en" = "en", rows: PaymentLinkV2DirectoryRow[] = [row()]) {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue(locale);
  listV1.mockResolvedValue({ links: [], activeProducts: [], activeCurrencyPairs: [] });
  queryDirectory.mockResolvedValue({ rows });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("merchant links directory page", () => {
  it("redirects visitors without a valid session and administrators before any read", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(MerchantLinksPage()).rejects.toThrow("redirect:/login");
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("administrators stay out"));
    await expect(MerchantLinksPage()).rejects.toThrow("redirect:/admin");
    expect(listV1).not.toHaveBeenCalled();
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("renders the ready V2 directory with badges, expiry, share, and the era toggle to the untouched V1 section", async () => {
    ready("en", [
      row(),
      row({ id: "440e8400-e29b-41d4-a716-446655440011", state: "paid", paid: true, linkType: "SINGLE_USE" }),
      row({ id: "440e8400-e29b-41d4-a716-446655440012", state: "expired", expiresAt: new Date("2026-07-01T00:00:00.000Z") }),
      row({ id: "440e8400-e29b-41d4-a716-446655440013", state: "inactive", active: false, compositionKind: "PRODUCT_LINES", orderCount: 7, lines: [{ position: 1, quantity: 2, titlePtBr: "Café", titleEn: "Coffee", unitPrice: "9.9" }, { position: 2, quantity: 1, titlePtBr: "Bolo", titleEn: "Cake", unitPrice: "5" }] }),
    ]);

    // Eras partition the directory (14.5.2): the default `v2` era renders
    // Commerce V2 rows only; the untouched V1 directory is reachable only
    // through the explicit `filter.era=legacy` toggle, asserted below.
    const markup = renderToStaticMarkup(await MerchantLinksPage());
    expect(markup).toContain("Monthly donation");
    expect(markup).toContain("Coffee +1");
    expect(markup).toContain(">Active</");
    expect(markup).toContain(">Paid</");
    expect(markup).toContain(">Expired</");
    expect(markup).toContain(">Inactive</");
    expect(markup).toContain("Fixed amount");
    expect(markup).toContain("Product lines");
    expect(markup).toContain("Single use");
    expect(markup).toContain('href="/pay/abcdefghijklmnopqrstuvwx"');
    expect(markup).toContain('href="/links/v2/440e8400-e29b-41d4-a716-446655440010"');
    expect(markup).toContain('href="/links/v2/440e8400-e29b-41d4-a716-446655440010/orders"');
    expect(markup).toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).toContain("Identifier");
    expect(markup).toContain("Dates");
    expect(markup).toContain("View orders");
    expect(markup).toContain('action="/links"');
    expect(markup).not.toContain("An active product and currency pair are required.");

    const legacy = renderToStaticMarkup(await MerchantLinksPage({ searchParams: Promise.resolve({ "filter.era": "legacy" }) }));
    expect(legacy).toContain("An active product and currency pair are required.");
    expect(legacy).toContain("No payment links are available.");
  });

  it("renders localized pt-BR copy", async () => {
    ready("pt-BR");
    const markup = renderToStaticMarkup(await MerchantLinksPage());
    expect(markup).toContain("Doação mensal");
    expect(markup).toContain(">Ativo</");

    const legacy = renderToStaticMarkup(await MerchantLinksPage({ searchParams: Promise.resolve({ "filter.era": "legacy" }) }));
    expect(legacy).toContain("É necessário ter um produto e um par de moedas ativos.");
  });

  it("renders the empty and filtered-empty states", async () => {
    ready("en", []);
    const markup = renderToStaticMarkup(await MerchantLinksPage());
    expect(markup).toContain("No payment links yet");

    const filtered = renderToStaticMarkup(await MerchantLinksPage({ searchParams: Promise.resolve({ q: "no-such-link" }) }));
    expect(filtered).toContain("No matching records");
  });

  it("resets to the reset redirect without adapter I/O and without echoing input", async () => {
    ready("en");
    await expect(MerchantLinksPage({ searchParams: Promise.resolve({ forged: "1" }) })).rejects.toThrow("redirect:/links?filters=ignored");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("resets non-canonical queries before any read", async () => {
    ready("en");
    await expect(MerchantLinksPage({ searchParams: Promise.resolve({ pageSize: "25" }) })).rejects.toThrow("redirect:/links");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("renders the error state when the directory read fails while the V1 section stays reachable via the era toggle", async () => {
    ready("en");
    queryDirectory.mockRejectedValue(new Error("database unavailable"));
    const markup = renderToStaticMarkup(await MerchantLinksPage());
    expect(markup).toContain("The directory could not be loaded");
    const legacy = renderToStaticMarkup(await MerchantLinksPage({ searchParams: Promise.resolve({ "filter.era": "legacy" }) }));
    expect(legacy).toContain("An active product and currency pair are required.");
  });

  it("passes the cursor, filters, and search into the bounded merchant query and renders pagination URLs", async () => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    listV1.mockResolvedValue({ links: [], activeProducts: [], activeCurrencyPairs: [] });
    queryDirectory.mockResolvedValue({ rows: [row()], nextCursor: "next-token", previousCursor: "previous-token" });

    const markup = renderToStaticMarkup(await MerchantLinksPage({
      searchParams: Promise.resolve({ q: "donation", "filter.state": "active", pageSize: "50" }),
    }));
    expect(queryDirectory).toHaveBeenCalledWith(expect.objectContaining({
      principal,
      directory: "merchant-payment-links-v2",
      orderId: "created-desc",
      filters: { state: ["active"], q: "donation" },
      canonicalFilterQuery: "q=donation&filter.state=active",
      pageSize: 50,
    }));
    expect(markup).toContain("cursor=next-token");
    expect(markup).toContain("cursor=previous-token");
  });

  // 14.5.2 owed regression: the currency-pair column and filter, and the
  // `from`/`to` calendar-day filters, are additive on the V2 directory.
  it("renders the currency badge column and only registers the pair filter when the owner has active pairs", async () => {
    ready("en", [row({ currencyPairLabel: "BRL/USDT" })]);
    listOwnerActiveCurrencyPairs.mockResolvedValueOnce([]);
    const withoutPairs = renderToStaticMarkup(await MerchantLinksPage());
    expect(withoutPairs).toContain("BRL/USDT");
    expect(withoutPairs).not.toContain('name="filter.pair"');

    listOwnerActiveCurrencyPairs.mockResolvedValueOnce([{ id: "440e8400-e29b-41d4-a716-446655440020", label: "BRL/USDT" }]);
    const withPairs = renderToStaticMarkup(await MerchantLinksPage());
    expect(withPairs).toContain('name="filter.pair"');
  });

  it("renders the create affordance and each closed outcome notice in both locales", async () => {
    ready("en");
    const created = renderToStaticMarkup(await MerchantLinksPage({ searchParams: Promise.resolve({ "payment-links-v2": "created" }) }));
    expect(created).toContain('href="/links/new"');
    expect(created).toContain("The payment link was created.");

    ready("pt-BR");
    for (const [notice, copy] of [
      ["edited", "As alterações do link de pagamento foram salvas."],
      ["activated", "O link de pagamento foi ativado."],
      ["deactivated", "O link de pagamento foi desativado."],
    ] as const) {
      const markup = renderToStaticMarkup(await MerchantLinksPage({ searchParams: Promise.resolve({ "payment-links-v2": notice }) }));
      expect(markup).toContain(copy);
    }
  });

  it("renders the opaque failed notice and rejects a forged notice value before any read", async () => {
    ready("en");
    const failed = renderToStaticMarkup(await MerchantLinksPage({ searchParams: Promise.resolve({ "payment-links-v2": "failed" }) }));
    expect(failed).toContain("The payment-link change could not be saved.");

    await expect(MerchantLinksPage({ searchParams: Promise.resolve({ "payment-links-v2": "deleted" }) })).rejects.toThrow("redirect:/links?filters=ignored");
  });
});

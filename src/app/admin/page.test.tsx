import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";
import type { AdminAnalyticsView } from "@/orders/admin-analytics";

const { requireContext, getGlobal } = vi.hoisted(() => ({
  requireContext: vi.fn(),
  getGlobal: vi.fn(),
}));

vi.mock("./shell-context", () => ({ requireAdminShellContext: requireContext }));
vi.mock("@/orders/admin-analytics", () => ({ getAdminAnalyticsService: () => ({ getGlobal }) }));

import AdminPage from "./page";

const principal = { id: "admin-1", username: "operator", role: "ADMIN", status: "ACTIVE" } as const;
const brl = { code: "BRL", label: "Brazilian real" } as const;

function readyView(overrides: Partial<AdminAnalyticsView> = {}): AdminAnalyticsView {
  return {
    period: { id: "7d", from: new Date("2026-07-19T03:00:00Z"), to: new Date("2026-07-26T03:00:00Z") },
    users: { registeredTotal: 4, activeNow: 3, deletedTotal: 1 },
    orders: {
      createdInPeriod: 6,
      bySource: [{ source: "LINK", count: 4 }, { source: "AD_HOC", count: 2 }],
      byState: [{ state: "CONFIRMED", count: 3 }, { state: null, count: 2 }, { state: "PENDING", count: 1 }],
    },
    confirmedSales: [{ currency: brl, amount: "34.90", orderCount: 2 }],
    locallyFinalizedSales: [{ currency: brl, amount: "10", orderCount: 1 }],
    funnel: { attempts: 4, converted: 2, abandoned: 1, inProgress: 1, conversionRate: "0.6666", abandonmentRate: "0.3333" },
    paymentLinks: { total: 5, activeCount: 4 },
    products: { activeCount: 7, archivedCount: 2 },
    topOwners: [
      { owner: { username: "lojista", deleted: false }, confirmedOrders: 2, confirmedVolume: [{ currency: brl, amount: "34.90" }] },
      { owner: { username: "saiu", deleted: true }, confirmedOrders: 1, confirmedVolume: [{ currency: brl, amount: "10.50" }] },
    ],
    topProducts: [{ titlePtBr: "Café expresso", titleEn: "Espresso shot", confirmedQuantity: 3, revenue: [{ currency: brl, amount: "29.70" }] }],
    ...overrides,
  };
}

function arrange(locale: "pt-BR" | "en", view: AdminAnalyticsView) {
  requireContext.mockResolvedValue({ dictionary: locale === "pt-BR" ? ptBR : en, locale, principal });
  getGlobal.mockResolvedValue({ kind: "ready", view });
}

async function render(query: Record<string, string> = {}) {
  return renderToStaticMarkup(await AdminPage({ searchParams: Promise.resolve(query) } as never));
}

describe("administrator dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-authorizes and renders every section with confirmed and locally finalized sales separate", async () => {
    arrange("pt-BR", readyView());

    const html = await render();

    expect(requireContext).toHaveBeenCalledOnce();
    expect(getGlobal).toHaveBeenCalledWith(principal, undefined);
    expect(html).toContain(ptBR.shellAdminDashboardTitle);
    expect(html).toContain(ptBR.adminDashboardUsersHeading);
    expect(html).toContain(ptBR.adminDashboardOrdersHeading);
    expect(html).toContain(ptBR.adminDashboardConfirmedSales);
    expect(html).toContain(ptBR.adminDashboardLocallyFinalizedSales);
    expect(html).toContain("34,90 BRL");
    expect(html).toContain("10 BRL");
    expect(html).not.toContain("44,90");
    expect(html).toContain(ptBR.adminDashboardFunnelHeading);
    expect(html).toContain("66,66%");
    expect(html).toContain("33,33%");
    expect(html).toContain(ptBR.adminDashboardLinksProductsHeading);
    expect(html).toContain(ptBR.adminDashboardTopOwnersHeading);
    expect(html).toContain(ptBR.adminDashboardTopProductsHeading);
    expect(html).toContain("Café expresso");
  });

  it("marks users and links/products counts as period-independent", async () => {
    arrange("pt-BR", readyView());

    const html = await render();

    expect(html.match(new RegExp(ptBR.adminDashboardPeriodIndependentCaption, "g"))).toHaveLength(2);
  });

  it("labels the null order state explicitly and groups by source", async () => {
    arrange("pt-BR", readyView());

    const html = await render();

    expect(html).toContain(ptBR.adminDashboardStateNone);
    expect(html).toContain(ptBR.adminDashboardSourceLink);
    expect(html).toContain(ptBR.adminDashboardSourceAdHoc);
    expect(html).toContain(ptBR.checkoutStateConfirmed);
  });

  it("renders the deleted-owner badge on leaderboard rows without changing aggregates", async () => {
    arrange("pt-BR", readyView());

    const html = await render();

    expect(html).toContain("lojista");
    expect(html).toContain("saiu");
    expect(html).toContain(ptBR.adminDashboardDeletedOwnerBadge);
  });

  it("passes a closed-set period through to the service", async () => {
    arrange("pt-BR", readyView({ period: { id: "today", from: new Date(), to: new Date() } }));

    const html = await render({ period: "today" });

    expect(getGlobal).toHaveBeenCalledWith(principal, "today");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain(ptBR.adminDashboardPeriodToday);
    expect(html).toContain("href=\"/admin?period=7d\"");
  });

  it("maps an unknown period and the invalid-period kind to the pinned 7d default", async () => {
    requireContext.mockResolvedValue({ dictionary: ptBR, locale: "pt-BR", principal });
    getGlobal.mockImplementation((_actor: unknown, period: unknown) =>
      Promise.resolve(period === "7d" ? { kind: "ready", view: readyView() } : { kind: "invalid-period" }));

    const html = await render({ period: "bogus" });

    expect(getGlobal).toHaveBeenNthCalledWith(1, principal, "bogus");
    expect(getGlobal).toHaveBeenNthCalledWith(2, principal, "7d");
    expect(html).toContain("admin-dashboard__period--current");
    expect(html).toContain(ptBR.adminDashboardPeriod7d);
  });

  it("renders every explicit empty state when there is no data", async () => {
    arrange("pt-BR", readyView({
      orders: { createdInPeriod: 0, bySource: [], byState: [] },
      confirmedSales: [],
      locallyFinalizedSales: [],
      funnel: { attempts: 0, converted: 0, abandoned: 0, inProgress: 0, conversionRate: null, abandonmentRate: null },
      topOwners: [],
      topProducts: [],
    }));

    const html = await render();

    expect(html).toContain(ptBR.adminDashboardOrdersEmpty);
    expect(html).toContain(ptBR.adminDashboardSalesEmpty);
    expect(html).toContain(ptBR.adminDashboardFunnelEmpty);
    expect(html).toContain(ptBR.adminDashboardTopOwnersEmpty);
    expect(html).toContain(ptBR.adminDashboardTopProductsEmpty);
  });

  it("renders an explicit n/a for null rates and an unlabeled treatment for unlabeled currencies", async () => {
    arrange("pt-BR", readyView({
      confirmedSales: [{ currency: { code: null, label: null }, amount: "5", orderCount: 1 }],
      funnel: { attempts: 1, converted: 0, abandoned: 0, inProgress: 1, conversionRate: null, abandonmentRate: null },
    }));

    const html = await render();

    expect(html).toContain(ptBR.adminDashboardRateUnavailable);
    expect(html).toContain(ptBR.adminDashboardUnlabeledCurrency);
    expect(html).toContain("5 (moeda sem rótulo)");
  });

  it("renders the English copy for the en locale", async () => {
    arrange("en", readyView());

    const html = await render();

    expect(html).toContain(en.adminDashboardConfirmedSales);
    expect(html).toContain(en.adminDashboardLocallyFinalizedSales);
    expect(html).toContain("34.90 BRL");
    expect(html).toContain("Espresso shot");
    expect(html).toContain("66.66%");
    expect(html).toContain(en.adminDashboardDeletedOwnerBadge);
  });

  it("keeps the existing notice handling untouched", async () => {
    arrange("pt-BR", readyView());
    expect(await render({ success: "created" })).toContain(ptBR.adminCreated);

    arrange("pt-BR", readyView());
    expect(await render({ error: "catalog-change-failed" })).toContain(ptBR.adminCatalogChangeFailed);
  });

  it("renders no internal identifiers, emails, payer data, or provider material", async () => {
    arrange("pt-BR", readyView());

    const html = await render();

    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(html).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(html).not.toMatch(/verifier|capability|nonce|credential|provider order/i);
  });
});

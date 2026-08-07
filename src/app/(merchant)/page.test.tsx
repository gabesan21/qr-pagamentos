import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";
import type { MerchantAnalyticsView } from "@/orders/merchant-analytics";

import { formatDashboardRate } from "./dashboard";

const { requireContext, getForOwner, getSettings } = vi.hoisted(() => ({
  requireContext: vi.fn(),
  getForOwner: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock("./shell-context", () => ({ requireMerchantShellContext: requireContext }));
vi.mock("@/orders/merchant-analytics", () => ({ getMerchantAnalyticsService: () => ({ getForOwner }) }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ getForOwner: getSettings }) }));

import MerchantDashboardPage from "./page";

const principal = { id: "user-1", username: "lojista", role: "USER", status: "ACTIVE" } as const;
const brl = { code: "BRL", label: "Brazilian real" } as const;

function storefrontSettings(overrides: Partial<{ storefrontEnabled: boolean; storefrontSlug: string | null }> = {}) {
  return {
    storefrontSlug: null,
    storefrontDisplayNamePtBr: null,
    storefrontDisplayNameEn: null,
    storefrontAccentColor: null,
    storefrontEnabled: false,
    storefrontThemeId: null,
    storefrontLayout: null,
    storefrontLogoMediaIdentifier: null,
    storefrontStandalonePaymentsEnabled: false,
    storefrontDefaultCurrencyCode: null,
    ...overrides,
  };
}

function readyView(overrides: Partial<MerchantAnalyticsView> = {}): MerchantAnalyticsView {
  return {
    period: { id: "7d", from: new Date("2026-07-19T03:00:00Z"), to: new Date("2026-07-26T03:00:00Z") },
    confirmedSales: [{ currency: brl, amount: "34.90", orderCount: 2 }],
    locallyFinalizedSales: [{ currency: brl, amount: "10", orderCount: 1 }],
    funnel: { attempts: 4, converted: 2, abandoned: 1, inProgress: 1, conversionRate: "0.6666", abandonmentRate: "0.3333" },
    bestSellers: [{ titlePtBr: "Café expresso", titleEn: "Espresso shot", confirmedQuantity: 3, revenue: [{ currency: brl, amount: "29.70" }] }],
    paymentLinks: {
      activeCount: 1,
      metrics: [{ identifier: "abcdefghijklmnopqrstuvwx", descriptionPtBr: "Doação mensal", descriptionEn: "Monthly donation", attempts: 4, confirmedOrders: 2, confirmedVolume: [{ currency: brl, amount: "34.90" }] }],
    },
    recentActivity: [{
      source: "LINK",
      descriptionPtBr: "Doação mensal",
      descriptionEn: "Monthly donation",
      amount: "34.90",
      currency: brl,
      state: "CONFIRMED",
      currentLocalOutcome: null,
      paymentLinkV2Identifier: "abcdefghijklmnopqrstuvwx",
      createdAt: new Date("2026-07-20T12:00:00Z"),
      settledAt: new Date("2026-07-20T12:05:00Z"),
    }],
    ...overrides,
  };
}

function arrange(locale: "pt-BR" | "en", view: MerchantAnalyticsView, settings = storefrontSettings()) {
  requireContext.mockResolvedValue({ dictionary: locale === "pt-BR" ? ptBR : en, locale, principal });
  getForOwner.mockResolvedValue({ kind: "ready", view });
  getSettings.mockResolvedValue(settings);
}

async function render(notices: Record<string, string> = {}) {
  return renderToStaticMarkup(await MerchantDashboardPage({ searchParams: Promise.resolve(notices) } as never));
}

describe("merchant dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-authorizes and renders the ready view with confirmed and locally finalized sales separate", async () => {
    arrange("pt-BR", readyView());

    const html = await render();

    expect(requireContext).toHaveBeenCalledOnce();
    expect(getForOwner).toHaveBeenCalledWith(principal, undefined);
    expect(html).toContain(ptBR.merchantDashboardGreeting.replace("{username}", principal.username));
    expect(html).toContain(ptBR.merchantDashboardCheckoutAttempts);
    expect(html).toContain(ptBR.merchantDashboardConfirmedSales);
    expect(html).toContain(ptBR.merchantDashboardLocallyFinalizedSales);
    expect(html).toContain("34,90 BRL");
    expect(html).toContain("10 BRL");
    expect(html).not.toContain("44,90");
    expect(html).toContain("Café expresso");
    expect(html).toContain("Doação mensal");
    expect(html).toContain(ptBR.checkoutStateConfirmed);
    expect(html).toContain("66,66%");
    expect(html).toContain("33,33%");
    expect(html).toContain(ptBR.merchantDashboardViewAll);
    expect(html).toContain('href="/orders"');
  });

  it("passes a closed-set period through to the service", async () => {
    arrange("pt-BR", readyView({ period: { id: "today", from: new Date(), to: new Date() } }));

    const html = await render({ period: "today" });

    expect(getForOwner).toHaveBeenCalledWith(principal, "today");
    expect(html).toContain("aria-current=\"page\"");
    expect(html).toContain(ptBR.merchantDashboardPeriodToday);
  });

  it("maps an unknown period and the invalid-period kind to the pinned 7d default", async () => {
    requireContext.mockResolvedValue({ dictionary: ptBR, locale: "pt-BR", principal });
    getForOwner.mockImplementation((_actor: unknown, period: unknown) =>
      Promise.resolve(period === "7d" ? { kind: "ready", view: readyView() } : { kind: "invalid-period" }));
    getSettings.mockResolvedValue(storefrontSettings());

    const html = await render({ period: "bogus" });

    expect(getForOwner).toHaveBeenNthCalledWith(1, principal, "bogus");
    expect(getForOwner).toHaveBeenNthCalledWith(2, principal, "7d");
    expect(html).toContain("merchant-dashboard__period--current");
    expect(html).toContain(ptBR.merchantDashboardPeriod7d);
  });

  it("renders every explicit empty state when there is no data", async () => {
    arrange("pt-BR", readyView({
      confirmedSales: [],
      locallyFinalizedSales: [],
      funnel: { attempts: 0, converted: 0, abandoned: 0, inProgress: 0, conversionRate: null, abandonmentRate: null },
      bestSellers: [],
      paymentLinks: { activeCount: 0, metrics: [] },
      recentActivity: [],
    }));

    const html = await render();

    expect(html).toContain(ptBR.merchantDashboardNoSales);
    expect(html).toContain(ptBR.merchantDashboardSalesEmpty);
    expect(html).toContain(ptBR.merchantDashboardFunnelEmpty);
    expect(html).toContain(ptBR.merchantDashboardBestSellersEmpty);
    expect(html).toContain(ptBR.merchantDashboardRecentEmpty);
  });

  it("renders an explicit n/a for null rates and an unlabeled treatment for unlabeled currencies", async () => {
    arrange("pt-BR", readyView({
      confirmedSales: [{ currency: { code: null, label: null }, amount: "5", orderCount: 1 }],
      funnel: { attempts: 1, converted: 0, abandoned: 0, inProgress: 1, conversionRate: null, abandonmentRate: null },
    }));

    const html = await render();

    expect(html).toContain(ptBR.merchantDashboardRateUnavailable);
    expect(html).toContain(ptBR.merchantDashboardUnlabeledCurrency);
    expect(html).toContain("5 (moeda sem rótulo)");
  });

  it("renders the English copy for the en locale", async () => {
    arrange("en", readyView());

    const html = await render();

    expect(html).toContain(en.merchantDashboardConfirmedSales);
    expect(html).toContain(en.merchantDashboardLocallyFinalizedSales);
    expect(html).toContain("34.90 BRL");
    expect(html).toContain("Espresso shot");
    expect(html).toContain("Monthly donation");
    expect(html).toContain("66.66%");
  });

  it("shows View Store only when the storefront is enabled with a slug", async () => {
    arrange("pt-BR", readyView(), storefrontSettings({ storefrontEnabled: true, storefrontSlug: "minha-loja" }));
    const enabled = await render();
    expect(enabled).toContain('href="/store/minha-loja"');
    expect(enabled).toContain(ptBR.merchantDashboardViewStore);

    arrange("pt-BR", readyView(), storefrontSettings({ storefrontEnabled: false, storefrontSlug: "minha-loja" }));
    expect(await render()).not.toContain("/store/minha-loja");

    arrange("pt-BR", readyView(), storefrontSettings({ storefrontEnabled: true, storefrontSlug: null }));
    expect(await render()).not.toContain(ptBR.merchantDashboardViewStore);
  });

  it("keeps the existing notice handling untouched", async () => {
    arrange("pt-BR", readyView());

    const html = await render({ storefront: "failed" });

    expect(html).toContain(ptBR.ownerSettingsFailed);
  });
});

describe("formatDashboardRate", () => {
  it("shifts the exact decimal rate into a localized percent without Number", () => {
    expect(formatDashboardRate("0.5000", "pt-BR")).toBe("50,00%");
    expect(formatDashboardRate("0.5000", "en")).toBe("50.00%");
    expect(formatDashboardRate("1.0000", "en")).toBe("100.00%");
    expect(formatDashboardRate("0.3333", "en")).toBe("33.33%");
    expect(formatDashboardRate("0.0416", "en")).toBe("4.16%");
  });
});

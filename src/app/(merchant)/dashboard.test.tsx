import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";
import type { MerchantAnalyticsView } from "@/orders/merchant-analytics";
import { MerchantDashboard } from "./dashboard";

const principal = { id: "user-1", username: "lojista", role: "USER", status: "ACTIVE" } as const;
const brl = { code: "BRL", label: "Brazilian real" } as const;

function readyView(overrides: Partial<MerchantAnalyticsView> = {}): MerchantAnalyticsView {
  return {
    period: { id: "7d", from: new Date("2026-07-19T03:00:00Z"), to: new Date("2026-07-26T03:00:00Z") },
    confirmedSales: [],
    locallyFinalizedSales: [],
    funnel: { attempts: 0, converted: 0, abandoned: 0, inProgress: 0, conversionRate: null, abandonmentRate: null },
    bestSellers: [],
    paymentLinks: { activeCount: 0, metrics: [] },
    ordersInPeriod: 1,
    byStatus: [{ state: "CANCELLED", count: 1 }],
    byOrigin: [{ source: "LINK", count: 1 }],
    recentActivity: [{
      id: "660e8400-e29b-41d4-a716-446655440066",
      payerName: "Bianca",
      source: "LINK",
      descriptionPtBr: "Pedido cancelado",
      descriptionEn: "Cancelled order",
      amount: "34.90",
      currency: brl,
      storeStatus: "CANCELLED",
      currentLocalOutcome: { outcome: "LOCAL_CANCELLED", createdAt: new Date("2026-07-20T12:00:00Z") },
      paymentLinkV2Identifier: "abcdefghijklmnopqrstuvwx",
      createdAt: new Date("2026-07-20T12:00:00Z"),
      settledAt: null,
    }],
    ...overrides,
  };
}

describe("MerchantDashboard unit component", () => {
  it("renders a single Cancelled status badge and orders by status heading in pt-BR and en", () => {
    const ptHtml = renderToStaticMarkup(
      <MerchantDashboard
        dictionary={ptBR}
        locale="pt-BR"
        view={readyView()}
      />
    );
    expect(ptHtml).toContain(ptBR.merchantDashboardByBreakdownHeading);
    expect(ptHtml).toContain(ptBR.merchantDashboardByState);
    expect(ptHtml).toContain(ptBR.orderV2DirectoryStateCancelledShort);
    expect(ptHtml).toContain("Cancelado");
    expect(ptHtml).not.toContain(ptBR.merchantDashboardOutcomeCancelled);

    const enHtml = renderToStaticMarkup(
      <MerchantDashboard
        dictionary={en}
        locale="en"
        view={readyView()}
      />
    );
    expect(enHtml).toContain(en.merchantDashboardByBreakdownHeading);
    expect(enHtml).toContain(en.merchantDashboardByState);
    expect(enHtml).toContain(en.orderV2DirectoryStateCancelledShort);
    expect(enHtml).toContain("Cancelled");
    expect(enHtml).not.toContain(en.merchantDashboardOutcomeCancelled);
  });
});

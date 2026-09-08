import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import type { AdminOrderV2Summary } from "@/orders/order-v2-admin-directory";

const { queryDirectory } = vi.hoisted(() => ({ queryDirectory: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/orders/order-v2-admin-directory", async (importActual) => ({
  ...(await importActual<typeof import("@/orders/order-v2-admin-directory")>()),
  queryAdminOrderV2Directory: (...args: unknown[]) => queryDirectory(...args),
}));

import { AssociatedOrdersCard } from "./associated-orders-card";

function summary(overrides: Partial<AdminOrderV2Summary>): AdminOrderV2Summary {
  return {
    amount: "10.00",
    checkoutDataPolicy: "NONE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    currencyUuid: "currency-uuid",
    currentLocalOutcome: null,
    descriptionEn: null,
    descriptionPtBr: null,
    exchangeCurrencyUuid: "exchange-uuid",
    id: "order-1",
    owner: { deletedAt: null, username: "merchant.one" },
    paymentLinkV2Identifier: "abcdefghijklmnopqrstuvwx",
    payer: { address: null, cpf: null, email: null, name: null },
    settledAt: null,
    source: "LINK",
    state: "CONFIRMED",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as AdminOrderV2Summary;
}

describe("associated orders card", () => {
  it("falls back to an empty list when the directory read throws an ordinary error", async () => {
    queryDirectory.mockRejectedValueOnce(new Error("database unavailable"));

    const markup = renderToStaticMarkup(
      await AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    );

    expect(markup).toContain(en.adminPaymentLinkOrdersCardEmpty);
  });

  it("re-throws a Next.js redirect control-flow error instead of swallowing it", async () => {
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    queryDirectory.mockRejectedValueOnce(redirectError);

    await expect(
      AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    ).rejects.toBe(redirectError);
  });

  it("re-throws a Next.js not-found control-flow error instead of swallowing it", async () => {
    const notFoundError = Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_NOT_FOUND" });
    queryDirectory.mockRejectedValueOnce(notFoundError);

    await expect(
      AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    ).rejects.toBe(notFoundError);
  });

  it("renders a row with the provider state badge, formatted amount, and view-order link", async () => {
    queryDirectory.mockResolvedValueOnce({
      status: "ready",
      rows: [summary({ amount: "1234.56", id: "order-confirmed", state: "CONFIRMED" })],
    });

    const markup = renderToStaticMarkup(
      await AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    );

    expect(markup).toContain(en.checkoutStateConfirmed);
    expect(markup).toContain("1,234.56");
    expect(markup).toContain('href="/admin/orders/v2/order-confirmed"');
  });

  it("renders the neutral state badge when the row's provider state is null", async () => {
    queryDirectory.mockResolvedValueOnce({
      status: "ready",
      rows: [summary({ id: "order-stateless", state: null })],
    });

    const markup = renderToStaticMarkup(
      await AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    );

    expect(markup).toContain(en.orderV2DirectoryStateNone);
  });

  it("renders the danger local-outcome badge for a locally cancelled order", async () => {
    queryDirectory.mockResolvedValueOnce({
      status: "ready",
      rows: [
        summary({
          currentLocalOutcome: { createdAt: new Date("2026-01-01T00:00:00.000Z"), note: null, outcome: "LOCAL_CANCELLED" },
          id: "order-local-cancelled",
        }),
      ],
    });

    const markup = renderToStaticMarkup(
      await AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    );

    expect(markup).toContain(en.orderV2DirectoryOutcomeCancelled);
  });

  it("points the view-all link at the filtered admin orders directory", async () => {
    queryDirectory.mockResolvedValueOnce({ status: "ready", rows: [summary({ id: "order-1" })] });

    const markup = renderToStaticMarkup(
      await AssociatedOrdersCard({ dictionary: en, linkIdentifier: "abcdefghijklmnopqrstuvwx", locale: "en" }),
    );

    expect(markup).toContain('href="/admin/orders?filter.link=abcdefghijklmnopqrstuvwx"');
  });
});

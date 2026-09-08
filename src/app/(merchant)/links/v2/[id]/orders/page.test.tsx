import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { OrderV2Summary } from "@/orders/order-v2-view";

const { requireOwnerFromCookie, resolveLocale, getForOwner, queryDirectory, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  getForOwner: vi.fn(),
  queryDirectory: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/payment-link-v2-view", () => ({ getPaymentLinkV2ViewService: () => ({ getForOwner }) }));
vi.mock("@/orders/order-v2-directory", () => ({ queryOwnerOrderV2Directory: (...args: unknown[]) => queryDirectory(...args) }));

import PaymentLinkV2OrdersPage from "./page";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const linkId = "440e8400-e29b-41d4-a716-446655440010";
const identifier = "abcdefghijklmnopqrstuvwx";
const path = `/links/v2/${linkId}/orders`;

const link = {
  id: linkId,
  identifier,
  sharePath: `/pay/${identifier}`,
  compositionKind: "FIXED_AMOUNT" as const,
  descriptionPtBr: "Doação mensal",
  descriptionEn: "Monthly donation",
  amount: "10.50",
  currencyPairLabel: "BRL/USDT",
  linkType: "REUSABLE" as const,
  expiresAt: null,
  active: true,
  paid: true,
  orderCount: 2,
  state: "paid" as const,
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
  updatedAt: new Date("2026-07-02T12:00:00.000Z"),
  lines: [],
};

function order(overrides: Partial<OrderV2Summary> = {}): OrderV2Summary {
  return {
    id: "440e8400-e29b-41d4-a716-446655440020",
    source: "LINK",
    paymentLinkV2Identifier: identifier,
    amount: "34.9",
    currencyUuid: "440e8400-e29b-41d4-a716-446655440030",
    exchangeCurrencyUuid: "440e8400-e29b-41d4-a716-446655440031",
    descriptionPtBr: "Doação mensal",
    descriptionEn: "Monthly donation",
    state: "CONFIRMED",
    currentLocalOutcome: null,
    checkoutDataPolicy: "NONE",
    payer: { name: null, email: null, cpf: null, address: null },
    createdAt: new Date("2026-07-03T12:00:00.000Z"),
    updatedAt: new Date("2026-07-03T13:00:00.000Z"),
    settledAt: new Date("2026-07-03T14:00:00.000Z"),
    ...overrides,
  };
}

function ready(locale: "pt-BR" | "en" = "en", rows: OrderV2Summary[] = [order()]) {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue(locale);
  getForOwner.mockResolvedValue({ kind: "found", link });
  queryDirectory.mockResolvedValue({ status: "ready", rows, pageSize: 20 });
}

const request = (searchParams: Record<string, string> = {}) => ({
  params: Promise.resolve({ id: linkId }),
  searchParams: Promise.resolve(searchParams),
});

beforeEach(() => { vi.clearAllMocks(); });

describe("merchant V2 payment-link order drilldown list page", () => {
  it("redirects visitors without a valid session and administrators before any read", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(PaymentLinkV2OrdersPage(request())).rejects.toThrow("redirect:/login");
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("administrators stay out"));
    await expect(PaymentLinkV2OrdersPage(request())).rejects.toThrow("redirect:/admin");
    expect(getForOwner).not.toHaveBeenCalled();
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("renders the opaque link unavailable state and never queries the directory", async () => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    getForOwner.mockResolvedValue({ kind: "unavailable" });

    const markup = renderToStaticMarkup(await PaymentLinkV2OrdersPage(request()));
    expect(markup).toContain("This payment link is unavailable");
    expect(markup).not.toContain("forged");
    expect(queryDirectory).not.toHaveBeenCalled();
  });

  it("force-binds the parent identifier and the drilldown path, overriding a client filter", async () => {
    ready("en");
    const markup = renderToStaticMarkup(await PaymentLinkV2OrdersPage(request({ "filter.link": "forged-forged-forged-forged" })));

    expect(queryDirectory).toHaveBeenCalledWith(`${path}?filter.link=${identifier}`, path);
    const [target] = queryDirectory.mock.calls[0];
    expect(target).not.toContain("forged");
    expect(markup).toContain("Monthly donation");
    expect(markup).toContain("34.9");
    expect(markup).toContain("Payment confirmed");
    expect(markup).toContain(`href="${path}/440e8400-e29b-41d4-a716-446655440020"`);
    expect(markup).toContain(`action="${path}"`);
    expect(markup).toContain(`href="/links/v2/${linkId}"`);
  });

  it("keeps other filters and the search alongside the forced identifier", async () => {
    ready("en");
    await PaymentLinkV2OrdersPage(request({ q: "payer", "filter.source": "LINK", pageSize: "50" }));
    const [target] = queryDirectory.mock.calls[0];
    expect(target).toContain("q=payer");
    expect(target).toContain("filter.source=LINK");
    expect(target).toContain("pageSize=50");
    expect(target).toContain(`filter.link=${identifier}`);
  });

  it("renders only the returned rows", async () => {
    ready("en", [
      order(),
      order({ id: "440e8400-e29b-41d4-a716-446655440021", descriptionPtBr: null, descriptionEn: null, state: null }),
    ]);
    const markup = renderToStaticMarkup(await PaymentLinkV2OrdersPage(request()));
    expect(markup).toContain("Monthly donation");
    expect(markup).toContain("440e8400-e29b-41d4-a716-446655440021");
    expect(markup).toContain("Not provided");
    expect(markup).not.toContain("440e8400-e29b-41d4-a716-446655440022");
  });

  it("renders pagination URLs on the drilldown path with the forced filter", async () => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    getForOwner.mockResolvedValue({ kind: "found", link });
    queryDirectory.mockResolvedValue({ status: "ready", rows: [order()], pageSize: 20, nextCursor: "next-token", previousCursor: "previous-token" });

    const markup = renderToStaticMarkup(await PaymentLinkV2OrdersPage(request()));
    expect(markup).toContain(`${path}?filter.link=${identifier}&amp;cursor=next-token`);
    expect(markup).toContain(`${path}?filter.link=${identifier}&amp;cursor=previous-token`);
  });

  it("follows the canonical redirect of the directory foundation", async () => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    getForOwner.mockResolvedValue({ kind: "found", link });
    queryDirectory.mockResolvedValue({ status: "redirect", location: `${path}?filter.link=${identifier}` });

    await expect(PaymentLinkV2OrdersPage(request())).rejects.toThrow(`redirect:${path}?filter.link=${identifier}`);
  });

  it("resets to the reset redirect without echoing input", async () => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    getForOwner.mockResolvedValue({ kind: "found", link });
    queryDirectory.mockResolvedValue({ status: "invalid-query" });

    await expect(PaymentLinkV2OrdersPage(request({ forged: "1" }))).rejects.toThrow(`redirect:${path}?filters=ignored`);
  });

  it("renders the empty and filtered-empty states", async () => {
    ready("en", []);
    const markup = renderToStaticMarkup(await PaymentLinkV2OrdersPage(request()));
    expect(markup).toContain("No orders yet");

    const filtered = renderToStaticMarkup(await PaymentLinkV2OrdersPage(request({ q: "no-such-payer" })));
    expect(filtered).toContain("No matching records");
  });

  it("renders the error state when the directory read fails", async () => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    getForOwner.mockResolvedValue({ kind: "found", link });
    queryDirectory.mockRejectedValue(new Error("database unavailable"));

    const markup = renderToStaticMarkup(await PaymentLinkV2OrdersPage(request()));
    expect(markup).toContain("The directory could not be loaded");
  });

  it("renders localized pt-BR copy", async () => {
    ready("pt-BR", [order({ currentLocalOutcome: { outcome: "LOCAL_FINALIZED", note: "Conferido", createdAt: new Date("2026-07-04T12:00:00.000Z") } })]);
    const markup = renderToStaticMarkup(await PaymentLinkV2OrdersPage(request()));
    expect(markup).toContain("Pedidos do link");
    expect(markup).toContain("Doação mensal");
    expect(markup).toContain("Pagamento confirmado");
    expect(markup).toContain("Finalizado localmente");
    expect(markup).toContain("Voltar ao link de pagamento");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";

const { requireOwnerFromCookie, resolveLocale, getLinkForOwner, getOrderForOwner, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  getLinkForOwner: vi.fn(),
  getOrderForOwner: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ getForOwner: () => Promise.resolve({ storefrontEnabled: false, storefrontSlug: null }) }) }));
vi.mock("@/auth/payment-link-v2-view", () => ({ getPaymentLinkV2ViewService: () => ({ getForOwner: getLinkForOwner }) }));
vi.mock("@/orders/order-v2-view", () => ({ getOrderV2ViewService: () => ({ getForOwner: getOrderForOwner }) }));

import PaymentLinkV2OrderDetailPage from "./page";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const linkId = "440e8400-e29b-41d4-a716-446655440010";
const orderId = "440e8400-e29b-41d4-a716-446655440020";
const identifier = "abcdefghijklmnopqrstuvwx";

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

const order = {
  id: orderId,
  source: "LINK" as const,
  paymentLinkV2Identifier: identifier,
  amount: "34.9",
  currencyUuid: "440e8400-e29b-41d4-a716-446655440030",
  exchangeCurrencyUuid: "440e8400-e29b-41d4-a716-446655440031",
  descriptionPtBr: "Doação mensal",
  descriptionEn: "Monthly donation",
  state: "CONFIRMED" as const,
  currentLocalOutcome: { outcome: "LOCAL_FINALIZED" as const, note: "Checked in person", createdAt: new Date("2026-07-04T12:00:00.000Z") },
  checkoutDataPolicy: "NAME_EMAIL" as const,
  createdAt: new Date("2026-07-03T12:00:00.000Z"),
  updatedAt: new Date("2026-07-03T13:00:00.000Z"),
  settledAt: new Date("2026-07-03T14:00:00.000Z"),
  customer: { name: "Payer Name", email: "payer@example.com", cpf: null, address: null },
  lines: [{ productId: "440e8400-e29b-41d4-a716-446655440040", position: 1, quantity: 2, unitPrice: "9.9" }],
  comments: [{ id: "440e8400-e29b-41d4-a716-446655440050", body: "Customer asked for a receipt", version: 1, createdAt: new Date("2026-07-03T15:00:00.000Z"), editedAt: null }],
};

const request = (id: string = linkId, order: string = orderId) => ({ params: Promise.resolve({ id, orderId: order }) });

function ready(locale: "pt-BR" | "en" = "en") {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue(locale);
  getLinkForOwner.mockResolvedValue({ kind: "found", link });
  getOrderForOwner.mockResolvedValue({ kind: "found", order });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("merchant V2 payment-link order drilldown detail page", () => {
  it("redirects visitors without a valid session and administrators before any read", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(PaymentLinkV2OrderDetailPage(request())).rejects.toThrow("redirect:/login");
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("administrators stay out"));
    await expect(PaymentLinkV2OrderDetailPage(request())).rejects.toThrow("redirect:/admin");
    expect(getLinkForOwner).not.toHaveBeenCalled();
    expect(getOrderForOwner).not.toHaveBeenCalled();
  });

  it("renders the link unavailable state and never reads the order", async () => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    getLinkForOwner.mockResolvedValue({ kind: "unavailable" });

    const markup = renderToStaticMarkup(await PaymentLinkV2OrderDetailPage(request("forged", orderId)));
    expect(markup).toContain("This payment link is unavailable");
    expect(markup).not.toContain("forged");
    expect(getOrderForOwner).not.toHaveBeenCalled();
  });

  it("renders the read-only order detail when the identifier matches the parent link", async () => {
    ready("en");
    const markup = renderToStaticMarkup(await PaymentLinkV2OrderDetailPage(request()));

    expect(getLinkForOwner).toHaveBeenCalledWith(principal, linkId);
    expect(getOrderForOwner).toHaveBeenCalledWith(principal, orderId);
    expect(markup).toContain("Monthly donation");
    expect(markup).toContain("34.9");
    expect(markup).toContain("Payment confirmed");
    expect(markup).toContain("Finalized locally");
    expect(markup).toContain("Checked in person");
    expect(markup).toContain(identifier);
    expect(markup).toContain("Payer Name");
    expect(markup).toContain("payer@example.com");
    expect(markup).toContain("Customer asked for a receipt");
    expect(markup).toContain(`href="/links/v2/${linkId}/orders"`);
    expect(markup).not.toContain(order.currencyUuid);
    expect(markup).not.toContain(order.exchangeCurrencyUuid);
  });

  it("renders localized pt-BR copy", async () => {
    ready("pt-BR");
    const markup = renderToStaticMarkup(await PaymentLinkV2OrderDetailPage(request()));
    expect(markup).toContain("Pedido do link");
    expect(markup).toContain("Doação mensal");
    expect(markup).toContain("Pagamento confirmado");
    expect(markup).toContain("Finalizado localmente");
    expect(markup).toContain("Voltar aos pedidos do link");
  });

  it.each([
    ["not found", { kind: "unavailable" as const }],
    ["a mismatched parent identifier", { kind: "found" as const, order: { ...order, paymentLinkV2Identifier: "xwvutsrqponmlkjihgfedcba" } }],
    ["an ad-hoc order without a link", { kind: "found" as const, order: { ...order, source: "AD_HOC" as const, paymentLinkV2Identifier: null } }],
  ])("renders the one opaque unavailable state for %s", async (_case, result) => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue("en");
    getLinkForOwner.mockResolvedValue({ kind: "found", link });
    getOrderForOwner.mockResolvedValue(result);

    const markup = renderToStaticMarkup(await PaymentLinkV2OrderDetailPage(request()));
    expect(markup).toContain("This order is unavailable");
    expect(markup).toContain(`href="/links/v2/${linkId}/orders"`);
    expect(markup).not.toContain("Monthly donation");
    expect(markup).not.toContain("Payer Name");
  });
});

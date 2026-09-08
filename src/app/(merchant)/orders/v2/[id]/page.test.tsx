import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { OrderV2View } from "@/orders/order-v2-view";

const { requireOwnerFromCookie, resolveLocale, getForOwner, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  getForOwner: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ getForOwner: () => Promise.resolve({ storefrontEnabled: false, storefrontSlug: null }) }) }));
vi.mock("@/orders/order-v2-view", async (importActual) => ({
  ...(await importActual<typeof import("@/orders/order-v2-view")>()),
  getOrderV2ViewService: () => ({ getForOwner }),
}));

import OrderV2DetailPage from "./page";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const orderId = "440e8400-e29b-41d4-a716-446655440010";
const productUuid = "770e8400-e29b-41d4-a716-446655440077";

function order(overrides: Partial<OrderV2View> = {}): OrderV2View {
  return {
    id: orderId,
    source: "LINK",
    paymentLinkV2Identifier: "abcdefghijklmnopqrstuvwx",
    amount: "34.90",
    currencyUuid: "990e8400-e29b-41d4-a716-446655440099",
    exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa",
    descriptionPtBr: "Doação mensal",
    descriptionEn: "Monthly donation",
    state: "PENDING",
    currentLocalOutcome: { outcome: "LOCAL_FINALIZED", note: "Entrega feita", createdAt: new Date("2026-07-03T12:00:00.000Z") },
    checkoutDataPolicy: "NAME_EMAIL",
    payer: { name: "Ana", email: "ana@example.com", cpf: null, address: null },
    lifecycleVersion: 3,
    customer: { name: "Ana", email: "ana@example.com", cpf: null, address: null },
    lines: [
      { productId: productUuid, position: 1, quantity: 2, unitPrice: "12.50" },
      { productId: productUuid, position: 2, quantity: 1, unitPrice: "9.90" },
    ],
    comments: [
      { id: "550e8400-e29b-41d4-a716-446655440055", body: "Primeiro comentário", version: 2, createdAt: new Date("2026-07-02T12:00:00.000Z"), editedAt: new Date("2026-07-02T13:00:00.000Z") },
      { id: "550e8400-e29b-41d4-a716-446655440056", body: "Second comment", version: 0, createdAt: new Date("2026-07-03T12:00:00.000Z"), editedAt: null },
    ],
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    settledAt: null,
    ...overrides,
  };
}

function ready(locale: "pt-BR" | "en" = "en", result: { kind: "found"; order: OrderV2View } | { kind: "unavailable" } = { kind: "found", order: order() }) {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue(locale);
  getForOwner.mockResolvedValue(result);
}

beforeEach(() => { vi.clearAllMocks(); });

describe("merchant V2 order detail page", () => {
  it("redirects visitors without a valid session and administrators before any read", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(OrderV2DetailPage({ params: Promise.resolve({ id: orderId }) })).rejects.toThrow("redirect:/login");
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("administrators stay out"));
    await expect(OrderV2DetailPage({ params: Promise.resolve({ id: orderId }) })).rejects.toThrow("redirect:/admin");
    expect(getForOwner).not.toHaveBeenCalled();
  });

  it("renders the full facts, policy-exact customer, ordered lines, and no internal identifiers", async () => {
    ready("en");
    const markup = renderToStaticMarkup(await OrderV2DetailPage({ params: Promise.resolve({ id: orderId }) }));
    expect(getForOwner).toHaveBeenCalledWith(principal, orderId);
    expect(markup).toContain("Monthly donation");
    expect(markup).toContain(">Waiting for payment</");
    expect(markup).toContain(">Locally finalized</");
    expect(markup).toContain("Entrega feita");
    expect(markup).toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).toContain("Ana");
    expect(markup).toContain("ana@example.com");
    expect(markup).toContain("34.90");
    expect(markup).toContain("12.50");
    expect(markup).toContain('href="/orders"');
    expect(markup).not.toContain(productUuid);
    expect(markup).not.toContain("990e8400-e29b-41d4-a716-446655440099");
    // The CPF is null and the NAME_EMAIL policy never required it: the hint
    // reads as policy compliance, never a bare em dash or a missing capture.
    expect(markup).toContain("Not required by this link&#x27;s data policy");
  });

  it("renders the comment thread with author edit CAS and the append form grammar", async () => {
    ready("en");
    const markup = renderToStaticMarkup(await OrderV2DetailPage({ params: Promise.resolve({ id: orderId }) }));
    expect(markup).toContain("Primeiro comentário");
    expect(markup).toContain("Second comment");
    expect(markup).toContain("Edited");
    expect(markup).toContain(`action="/orders-v2/${orderId}"`);
    expect(markup).toContain('value="append-comment"');
    expect(markup).toContain('value="edit-comment"');
    expect(markup).toContain('name="commentId" value="550e8400-e29b-41d4-a716-446655440055"');
    expect(markup).toContain('name="commentVersion" value="2"');
  });

  it("posts the projection-supplied lifecycle CAS behind destructive confirmations", async () => {
    ready("en");
    const markup = renderToStaticMarkup(await OrderV2DetailPage({ params: Promise.resolve({ id: orderId }) }));
    expect(markup).toContain('name="version" value="3"');
    expect(markup).toContain('value="LOCAL_FINALIZED"');
    expect(markup).toContain('value="LOCAL_CANCELLED"');
    expect(markup).toContain("Confirm local finalization");
    expect(markup).toContain("Confirm local cancellation");
    expect(markup).toContain('name="note"');
  });

  it("renders localized pt-BR copy", async () => {
    ready("pt-BR");
    const markup = renderToStaticMarkup(await OrderV2DetailPage({ params: Promise.resolve({ id: orderId }) }));
    expect(markup).toContain("Doação mensal");
    expect(markup).toContain(">Aguardando pagamento</");
    expect(markup).toContain(">Finalizado localmente</");
    expect(markup).toContain("Confirmar cancelamento local");
    expect(markup).toContain("Novo comentário");
  });

  it("renders the empty comment thread", async () => {
    ready("en", { kind: "found", order: order({ comments: [], lines: [], currentLocalOutcome: null }) });
    const markup = renderToStaticMarkup(await OrderV2DetailPage({ params: Promise.resolve({ id: orderId }) }));
    expect(markup).toContain("No comments yet.");
    expect(markup).toContain(">No local outcome</");
  });

  it("shares one opaque unavailable view for cross-owner, malformed, and missing identities", async () => {
    ready("en", { kind: "unavailable" });
    const markup = renderToStaticMarkup(await OrderV2DetailPage({ params: Promise.resolve({ id: "not-an-order" }) }));
    expect(markup).toContain("This order is unavailable");
    expect(markup).not.toContain("not-an-order");
    expect(markup).not.toContain("Monthly donation");
    expect(markup).not.toContain(`/orders-v2/`);
  });
});

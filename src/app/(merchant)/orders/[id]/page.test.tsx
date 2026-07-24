import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { resolvePrincipal, resolveLocale, getForOwner, redirect } = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  resolveLocale: vi.fn(),
  getForOwner: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: resolvePrincipal }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/orders/order-view", () => ({ getOrderViewService: () => ({ getForOwner }) }));
vi.mock("@/app/admin/product-management", () => ({ formatProductPrice: (price: string) => `BRL ${price}` }));

import OrderDetailPage from "./page";

const principal = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const orderId = "440e8400-e29b-41d4-a716-446655440044";

const found = {
  kind: "found" as const,
  order: {
    id: orderId,
    paymentLinkIdentifier: "link-identifier",
    productTitlePtBr: "Doação",
    productTitleEn: "Donation",
    amount: "10.50",
    currencyPairLabel: "BRL/USDT",
    state: "CONFIRMED" as const,
    checkoutDataPolicy: "NAME_EMAIL_CPF_ADDRESS" as const,
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    settledAt: new Date("2026-07-02T12:00:00.000Z"),
    customer: {
      name: "Ada",
      email: "ada@example.test",
      cpf: "52998224725",
      address: { street: "Rua A", number: "10", district: "Centro", city: "São Paulo", stateUf: "SP", postalCode: "01001000", country: "BR" as const, complement: null },
    },
  },
};

describe("owner order detail page", () => {
  it("redirects visitors without a valid session before reading the order", async () => {
    resolvePrincipal.mockResolvedValueOnce(null);
    await expect(OrderDetailPage({ params: Promise.resolve({ id: orderId }) })).rejects.toThrow("redirect:/login");
    expect(getForOwner).not.toHaveBeenCalled();
  });

  it("redirects administrators before params, locale, or owner-order reads", async () => {
    resolvePrincipal.mockResolvedValueOnce({ ...principal, id: "admin", role: "ADMIN" });
    const params = Promise.resolve({ id: orderId });

    await expect(OrderDetailPage({ params })).rejects.toThrow("redirect:/admin");
    expect(resolveLocale).not.toHaveBeenCalled();
    expect(getForOwner).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "Donation", "Name", "Payment confirmed"],
    ["pt-BR", "Doação", "Nome", "Pagamento confirmado"],
  ] as const)("renders the policy-shaped customer snapshot in %s", async (locale, title, nameLabel, state) => {
    resolvePrincipal.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue(locale);
    getForOwner.mockResolvedValue(found);

    const markup = renderToStaticMarkup(await OrderDetailPage({ params: Promise.resolve({ id: orderId }) }));
    expect(getForOwner).toHaveBeenCalledWith(principal, orderId);
    expect(markup).toContain(title);
    expect(markup).toContain(state);
    expect(markup).toContain(nameLabel);
    expect(markup).toContain("Ada");
    expect(markup).toContain("ada@example.test");
    expect(markup).toContain("52998224725");
    expect(markup).toContain("Rua A");
    expect(markup).toContain("01001000");
    expect(markup).toContain('href="/orders"');
    expect(markup).not.toContain("lifecycleVersion");
  });

  it.each([
    ["en", "This order is unavailable"],
    ["pt-BR", "Este pedido está indisponível"],
  ] as const)("renders the same opaque unavailable view for missing and cross-owner orders in %s", async (locale, heading) => {
    resolvePrincipal.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue(locale);
    getForOwner.mockResolvedValue({ kind: "unavailable" });

    const markup = renderToStaticMarkup(await OrderDetailPage({ params: Promise.resolve({ id: orderId }) }));
    expect(markup).toContain(heading);
    expect(markup).toContain('href="/orders"');
    expect(markup).not.toContain("Ada");
    expect(markup).not.toContain("link-identifier");
  });
});

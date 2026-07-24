import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { resolvePrincipal, resolveLocale, listForOwner, redirect } = vi.hoisted(() => ({
  resolvePrincipal: vi.fn(),
  resolveLocale: vi.fn(),
  listForOwner: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: resolvePrincipal }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/orders/order-view", () => ({ getOrderViewService: () => ({ listForOwner }) }));
vi.mock("@/app/admin/product-management", () => ({ formatProductPrice: (price: string) => `BRL ${price}` }));

import OrdersPage from "./page";

const principal = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

const order = {
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

describe("owner order list page", () => {
  it("redirects visitors without a valid session", async () => {
    resolvePrincipal.mockResolvedValueOnce(null);
    await expect(OrdersPage()).rejects.toThrow("redirect:/login");
    expect(listForOwner).not.toHaveBeenCalled();
  });

  it("redirects administrators before locale or owner-order reads", async () => {
    resolvePrincipal.mockResolvedValueOnce({ ...principal, id: "admin", role: "ADMIN" });

    await expect(OrdersPage()).rejects.toThrow("redirect:/admin");
    expect(resolveLocale).not.toHaveBeenCalled();
    expect(listForOwner).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "Orders", "Donation", "Payment confirmed"],
    ["pt-BR", "Pedidos", "Doação", "Pagamento confirmado"],
  ] as const)("re-authorizes the cookie principal and renders the ledger in %s", async (locale, heading, title, state) => {
    resolvePrincipal.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue(locale);
    listForOwner.mockResolvedValue([order]);

    const markup = renderToStaticMarkup(await OrdersPage());
    expect(listForOwner).toHaveBeenCalledWith(principal);
    expect(markup).toContain(heading);
    expect(markup).toContain(title);
    expect(markup).toContain(state);
    expect(markup).toContain("BRL 10.50");
    expect(markup).toContain("link-identifier");
    expect(markup).toContain(`href="/orders/${order.id}"`);
  });

  it.each([
    ["en", "No orders are available."],
    ["pt-BR", "Nenhum pedido está disponível."],
  ] as const)("renders the opaque empty state in %s", async (locale, empty) => {
    resolvePrincipal.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue(locale);
    listForOwner.mockResolvedValue([]);

    const markup = renderToStaticMarkup(await OrdersPage());
    expect(markup).toContain(empty);
    expect(markup).not.toContain("/orders/");
  });
});

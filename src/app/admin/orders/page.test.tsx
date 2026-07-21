import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { requireAdmin, resolveLocale, listForAdmin, redirect } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resolveLocale: vi.fn(),
  listForAdmin: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", () => ({
  ForbiddenError: class ForbiddenError extends Error {},
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  getAuthorizationService: () => ({ requireAdmin }),
}));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/orders/order-view", () => ({ getOrderViewService: () => ({ listForAdmin }) }));
vi.mock("@/app/admin/product-management", () => ({ formatProductPrice: (price: string) => `BRL ${price}` }));

import AdminOrdersPage from "./page";

const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

const order = {
  id: "440e8400-e29b-41d4-a716-446655440044",
  paymentLinkIdentifier: "link-identifier",
  productTitlePtBr: "Doação",
  productTitleEn: "Donation",
  amount: "10.50",
  currencyPairLabel: "BRL/USDT",
  state: "PENDING" as const,
  checkoutDataPolicy: "NONE" as const,
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
  updatedAt: new Date("2026-07-02T12:00:00.000Z"),
  settledAt: null,
};

describe("admin order list page", () => {
  it("redirects unauthenticated and non-admin visitors without reading any order", async () => {
    const { ForbiddenError, UnauthenticatedError } = await import("@/auth/authorization");
    requireAdmin.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(AdminOrdersPage()).rejects.toThrow("redirect:/login");

    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    await expect(AdminOrdersPage()).rejects.toThrow("redirect:/");
    expect(listForAdmin).not.toHaveBeenCalled();
  });

  it("preserves unexpected authorization failures for the recovery boundary", async () => {
    const failure = new Error("database unavailable");
    requireAdmin.mockRejectedValueOnce(failure);
    await expect(AdminOrdersPage()).rejects.toBe(failure);
  });

  it.each([
    ["en", "Orders", "Donation", "Waiting for payment"],
    ["pt-BR", "Pedidos", "Doação", "Aguardando pagamento"],
  ] as const)("re-authorizes the cookie principal and renders the global ledger in %s", async (locale, heading, title, state) => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue(locale);
    listForAdmin.mockResolvedValue([order]);

    const markup = renderToStaticMarkup(await AdminOrdersPage());
    expect(listForAdmin).toHaveBeenCalledWith(admin);
    expect(markup).toContain(heading);
    expect(markup).toContain(title);
    expect(markup).toContain(state);
    expect(markup).toContain(`href="/admin/orders/${order.id}"`);
    expect(markup).toContain('href="/admin"');
    expect(markup).not.toContain("<form");
  });

  it("renders the opaque empty state without disclosing other owners", async () => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    listForAdmin.mockResolvedValue([]);

    const markup = renderToStaticMarkup(await AdminOrdersPage());
    expect(markup).toContain("No orders are available.");
    expect(markup).not.toContain("/admin/orders/");
  });
});

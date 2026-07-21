import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { requireAdmin, resolveLocale, getForAdmin, redirect } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resolveLocale: vi.fn(),
  getForAdmin: vi.fn(),
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
vi.mock("@/orders/order-view", () => ({ getOrderViewService: () => ({ getForAdmin }) }));
vi.mock("@/app/admin/product-management", () => ({ formatProductPrice: (price: string) => `BRL ${price}` }));

import AdminOrderDetailPage from "./page";

const admin = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
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
    state: "PENDING" as const,
    checkoutDataPolicy: "NAME_EMAIL" as const,
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    settledAt: null,
    customer: { name: "Ada", email: "ada@example.test", cpf: null, address: null },
  },
};

describe("admin order detail page", () => {
  it("redirects unauthenticated and non-admin visitors without reading any order", async () => {
    const { ForbiddenError, UnauthenticatedError } = await import("@/auth/authorization");
    requireAdmin.mockRejectedValueOnce(new UnauthenticatedError());
    await expect(AdminOrderDetailPage({ params: Promise.resolve({ id: orderId }) })).rejects.toThrow("redirect:/login");

    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    await expect(AdminOrderDetailPage({ params: Promise.resolve({ id: orderId }) })).rejects.toThrow("redirect:/");
    expect(getForAdmin).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "Donation", "Name"],
    ["pt-BR", "Doação", "Nome"],
  ] as const)("renders any owner's order with the policy-shaped snapshot in %s", async (locale, title, nameLabel) => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue(locale);
    getForAdmin.mockResolvedValue(found);

    const markup = renderToStaticMarkup(await AdminOrderDetailPage({ params: Promise.resolve({ id: orderId }) }));
    expect(getForAdmin).toHaveBeenCalledWith(admin, orderId);
    expect(markup).toContain(title);
    expect(markup).toContain(nameLabel);
    expect(markup).toContain("Ada");
    expect(markup).toContain("ada@example.test");
    expect(markup).not.toContain("52998224725");
    expect(markup).toContain('href="/admin/orders"');
    expect(markup).not.toContain("<form");
  });

  it("renders the opaque unavailable view for a missing order", async () => {
    requireAdmin.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    getForAdmin.mockResolvedValue({ kind: "unavailable" });

    const markup = renderToStaticMarkup(await AdminOrderDetailPage({ params: Promise.resolve({ id: orderId }) }));
    expect(markup).toContain("This order is unavailable");
    expect(markup).not.toContain("Ada");
    expect(markup).not.toContain("link-identifier");
  });
});

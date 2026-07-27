import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { OrderV2View } from "@/orders/order-v2-view";

const { requireAdminFromCookie, resolveLocale, getForAdmin, readOwnerAttribution, redirect } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  getForAdmin: vi.fn(),
  readOwnerAttribution: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/orders/order-v2-view", () => ({ getOrderV2ViewService: () => ({ getForAdmin }) }));
vi.mock("@/orders/order-v2-admin-directory", async (importActual) => ({
  ...(await importActual<typeof import("@/orders/order-v2-admin-directory")>()),
  getAdminOrderV2DirectoryService: () => ({ readOwnerAttribution }),
}));
vi.mock("@/app/admin/product-management", () => ({ formatProductPrice: (price: string) => `BRL ${price}` }));

import AdminOrderV2DetailPage from "./page";

const admin = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

const order: OrderV2View = {
  id: "440e8400-e29b-41d4-a716-446655440010",
  source: "LINK",
  paymentLinkV2Identifier: "abcdefghijklmnopqrstuvwx",
  amount: "34.90",
  currencyUuid: "990e8400-e29b-41d4-a716-446655440099",
  exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa",
  descriptionPtBr: "Doação mensal",
  descriptionEn: "Monthly donation",
  state: "CONFIRMED",
  currentLocalOutcome: { outcome: "LOCAL_FINALIZED", note: "Entrega confirmada", createdAt: new Date("2026-07-03T12:00:00.000Z") },
  checkoutDataPolicy: "NAME_EMAIL",
  payer: { name: "Ana", email: "ana@example.com", cpf: null, address: null },
  customer: { name: "Ana", email: "ana@example.com", cpf: null, address: null },
  lifecycleVersion: 3,
  lines: [{ productId: "660e8400-e29b-41d4-a716-446655440066", position: 1, quantity: 2, unitPrice: "17.45" }],
  comments: [{ id: "770e8400-e29b-41d4-a716-446655440077", body: "Comentário do proprietário", version: 0, createdAt: new Date("2026-07-02T12:00:00.000Z"), editedAt: null }],
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
  updatedAt: new Date("2026-07-02T12:00:00.000Z"),
  settledAt: new Date("2026-07-02T12:00:00.000Z"),
};

function found(locale: "pt-BR" | "en" = "en", owner = { username: "merchant.one", deletedAt: null as Date | null }) {
  requireAdminFromCookie.mockResolvedValue(admin);
  resolveLocale.mockResolvedValue(locale);
  getForAdmin.mockResolvedValue({ kind: "found", order });
  readOwnerAttribution.mockResolvedValue(owner);
}

beforeEach(() => { vi.clearAllMocks(); });

describe("administrator order V2 detail page", () => {
  it("redirects visitors without a valid session and merchants before any read", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(AdminOrderV2DetailPage({ params: Promise.resolve({ id: order.id }) })).rejects.toThrow("redirect:/login");
    requireAdminFromCookie.mockRejectedValueOnce(new ForbiddenError("merchants stay out"));
    await expect(AdminOrderV2DetailPage({ params: Promise.resolve({ id: order.id }) })).rejects.toThrow("redirect:/");
    expect(getForAdmin).not.toHaveBeenCalled();
    expect(readOwnerAttribution).not.toHaveBeenCalled();
  });

  it("renders the read-only detail with owner attribution and no owner engagement surface", async () => {
    found("en");
    const markup = renderToStaticMarkup(await AdminOrderV2DetailPage({ params: Promise.resolve({ id: order.id }) }));
    expect(getForAdmin).toHaveBeenCalledWith(admin, order.id);
    expect(readOwnerAttribution).toHaveBeenCalledWith(admin, order.id);
    expect(markup).toContain("Monthly donation");
    expect(markup).toContain(">Payment confirmed</");
    expect(markup).toContain(">Locally finalized</");
    expect(markup).toContain("Ana");
    expect(markup).toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).toContain("Order owner");
    expect(markup).toContain("merchant.one");
    expect(markup).toContain('href="/admin/accounts"');
    expect(markup).toContain('href="/admin/orders"');
    // Read-only: the owner-only comment thread and local-outcome forms never
    // render, and redaction keeps pair/product UUIDs and lifecycle fields out.
    expect(markup).not.toContain("Comentário do proprietário");
    expect(markup).not.toContain("<form");
    expect(markup).not.toContain("990e8400-e29b-41d4-a716-446655440099");
    expect(markup).not.toContain("660e8400-e29b-41d4-a716-446655440066");
    expect(markup).not.toContain("lifecycleVersion");
  });

  it("renders the deleted badge for a soft-deleted owner", async () => {
    found("en", { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") });
    const markup = renderToStaticMarkup(await AdminOrderV2DetailPage({ params: Promise.resolve({ id: order.id }) }));
    expect(markup).toContain("gone.owner");
    expect(markup).toContain(">Deleted</");
  });

  it("renders the one opaque unavailable outcome for a missing order without an attribution read", async () => {
    requireAdminFromCookie.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    getForAdmin.mockResolvedValue({ kind: "unavailable" });

    const markup = renderToStaticMarkup(await AdminOrderV2DetailPage({ params: Promise.resolve({ id: "440e8400-e29b-41d4-a716-446655440099" }) }));
    expect(markup).toContain("This order is unavailable");
    expect(markup).not.toContain("merchant.one");
    expect(readOwnerAttribution).not.toHaveBeenCalled();
  });

  it("keeps the one opaque unavailable outcome when the attribution read misses", async () => {
    requireAdminFromCookie.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    getForAdmin.mockResolvedValue({ kind: "found", order });
    readOwnerAttribution.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await AdminOrderV2DetailPage({ params: Promise.resolve({ id: order.id }) }));
    expect(markup).toContain("This order is unavailable");
    expect(markup).not.toContain("Monthly donation");
    expect(markup).not.toContain("merchant.one");
  });
});

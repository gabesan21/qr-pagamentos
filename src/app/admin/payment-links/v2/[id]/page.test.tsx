import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import type { AdminPaymentLinkV2DirectoryRow } from "@/auth/payment-link-v2-admin-directory";

const { requireAdminFromCookie, resolveLocale, getForAdmin, redirect } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  getForAdmin: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/payment-link-v2-admin-directory", async (importActual) => ({
  ...(await importActual<typeof import("@/auth/payment-link-v2-admin-directory")>()),
  getAdminPaymentLinkV2DirectoryService: () => ({ getForAdmin }),
}));

import AdminPaymentLinkV2DetailPage from "./page";

const admin = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };

const link: AdminPaymentLinkV2DirectoryRow = {
  id: "440e8400-e29b-41d4-a716-446655440010",
  identifier: "abcdefghijklmnopqrstuvwx",
  sharePath: "/pay/abcdefghijklmnopqrstuvwx",
  compositionKind: "PRODUCT_LINES",
  descriptionPtBr: null,
  descriptionEn: null,
  amount: null,
  currencyPairLabel: "BRL/USDT",
  linkType: "SINGLE_USE",
  expiresAt: new Date("2026-08-01T00:00:00.000Z"),
  active: true,
  paid: false,
  orderCount: 2,
  state: "active",
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
  updatedAt: new Date("2026-07-02T12:00:00.000Z"),
  lines: [
    { position: 1, quantity: 2, titlePtBr: "Café especial", titleEn: "Special coffee", unitPrice: "17.45" },
    { position: 2, quantity: 1, titlePtBr: "Bolo de milho", titleEn: "Corn cake", unitPrice: "12.00" },
  ],
  owner: { username: "merchant.one", deletedAt: null },
};

function found(locale: "pt-BR" | "en" = "en", owner = { username: "merchant.one", deletedAt: null as Date | null }) {
  requireAdminFromCookie.mockResolvedValue(admin);
  resolveLocale.mockResolvedValue(locale);
  getForAdmin.mockResolvedValue({ kind: "found", link: { ...link, owner } });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("administrator payment-link V2 detail page", () => {
  it("redirects visitors without a valid session and merchants before any read", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(AdminPaymentLinkV2DetailPage({ params: Promise.resolve({ id: link.id }) })).rejects.toThrow("redirect:/login");
    requireAdminFromCookie.mockRejectedValueOnce(new ForbiddenError("merchants stay out"));
    await expect(AdminPaymentLinkV2DetailPage({ params: Promise.resolve({ id: link.id }) })).rejects.toThrow("redirect:/");
    expect(getForAdmin).not.toHaveBeenCalled();
  });

  it("renders the read-only detail with composition facts, owner attribution, and the order drill-down", async () => {
    found("en");
    const markup = renderToStaticMarkup(await AdminPaymentLinkV2DetailPage({ params: Promise.resolve({ id: link.id }) }));
    expect(getForAdmin).toHaveBeenCalledWith(admin, link.id);
    expect(markup).toContain("Special coffee");
    expect(markup).toContain("Corn cake");
    expect(markup).toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).toContain("BRL/USDT");
    expect(markup).toContain(">Active</");
    expect(markup).toContain("Payment-link owner");
    expect(markup).toContain("merchant.one");
    expect(markup).toContain('href="/admin/accounts"');
    expect(markup).toContain('href="/admin/payment-links"');
    // The drill-down navigates to the administrator orders directory filtered
    // by this link's identifier.
    expect(markup).toContain('href="/admin/orders?link=abcdefghijklmnopqrstuvwx"');
    // Read-only: no owner mutation surface, no edit or lifecycle actions.
    expect(markup).not.toContain("/links/v2/");
    expect(markup).not.toContain('method="post"');
    expect(markup).not.toContain(">Deleted</");
  });

  it("renders the deleted badge for a soft-deleted owner", async () => {
    found("en", { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") });
    const markup = renderToStaticMarkup(await AdminPaymentLinkV2DetailPage({ params: Promise.resolve({ id: link.id }) }));
    expect(markup).toContain("gone.owner");
    expect(markup).toContain(">Deleted</");
  });

  it("renders localized pt-BR copy", async () => {
    found("pt-BR", { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") });
    const markup = renderToStaticMarkup(await AdminPaymentLinkV2DetailPage({ params: Promise.resolve({ id: link.id }) }));
    expect(markup).toContain("Café especial");
    expect(markup).toContain("Proprietário do link");
    expect(markup).toContain(">Excluída</");
  });

  it("renders the one opaque unavailable outcome for a missing link", async () => {
    requireAdminFromCookie.mockResolvedValue(admin);
    resolveLocale.mockResolvedValue("en");
    getForAdmin.mockResolvedValue({ kind: "unavailable" });

    const markup = renderToStaticMarkup(await AdminPaymentLinkV2DetailPage({ params: Promise.resolve({ id: "440e8400-e29b-41d4-a716-446655440099" }) }));
    expect(markup).toContain("This payment link is unavailable");
    expect(markup).not.toContain("merchant.one");
    expect(markup).not.toContain("/admin/orders?link=");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";

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
vi.mock("@/auth/payment-link-v2-view", () => ({ getPaymentLinkV2ViewService: () => ({ getForOwner }) }));

import PaymentLinkV2DetailPage from "./page";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const linkId = "440e8400-e29b-41d4-a716-446655440010";

const found = {
  kind: "found" as const,
  link: {
    id: linkId,
    identifier: "abcdefghijklmnopqrstuvwx",
    sharePath: "/pay/abcdefghijklmnopqrstuvwx",
    compositionKind: "PRODUCT_LINES" as const,
    descriptionPtBr: null,
    descriptionEn: null,
    amount: null,
    currencyPairLabel: "BRL/USDT",
    linkType: "SINGLE_USE" as const,
    expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    active: true,
    paid: false,
    state: "active" as const,
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    lines: [
      { position: 1, quantity: 2, titlePtBr: "Café", titleEn: "Coffee", unitPrice: "9.9" },
      { position: 2, quantity: 1, titlePtBr: "Bolo", titleEn: "Cake", unitPrice: "5" },
    ],
  },
};

beforeEach(() => { vi.clearAllMocks(); });

describe("merchant V2 payment-link detail page", () => {
  it("redirects visitors without a valid session and administrators before any read", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(PaymentLinkV2DetailPage({ params: Promise.resolve({ id: linkId }) })).rejects.toThrow("redirect:/login");
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("administrators stay out"));
    await expect(PaymentLinkV2DetailPage({ params: Promise.resolve({ id: linkId }) })).rejects.toThrow("redirect:/admin");
    expect(getForOwner).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "Coffee", "Cake", "Quantity"],
    ["pt-BR", "Café", "Bolo", "Quantidade"],
  ] as const)("renders the ordered line facts in %s", async (locale, firstTitle, secondTitle, quantityLabel) => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue(locale);
    getForOwner.mockResolvedValue(found);

    const markup = renderToStaticMarkup(await PaymentLinkV2DetailPage({ params: Promise.resolve({ id: linkId }) }));
    expect(getForOwner).toHaveBeenCalledWith(principal, linkId);
    expect(markup).toContain(firstTitle);
    expect(markup).toContain(secondTitle);
    expect(markup).toContain(quantityLabel);
    expect(markup).toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).toContain("/pay/abcdefghijklmnopqrstuvwx");
    expect(markup).toContain("BRL/USDT");
    expect(markup).toContain('href="/links"');
  });

  it.each([
    ["en", "This payment link is unavailable"],
    ["pt-BR", "Este link de pagamento está indisponível"],
  ] as const)("renders one opaque unavailable view in %s", async (locale, heading) => {
    requireOwnerFromCookie.mockResolvedValue(principal);
    resolveLocale.mockResolvedValue(locale);
    getForOwner.mockResolvedValue({ kind: "unavailable" });

    const markup = renderToStaticMarkup(await PaymentLinkV2DetailPage({ params: Promise.resolve({ id: "forged" }) }));
    expect(markup).toContain(heading);
    expect(markup).toContain('href="/links"');
    expect(markup).not.toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).not.toContain("forged");
  });
});

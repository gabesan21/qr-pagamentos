import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";

const { requireOwnerFromCookie, resolveLocale, listV1, getForOwner, getPrefill, redirect } = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  resolveLocale: vi.fn(),
  listV1: vi.fn(),
  getForOwner: vi.fn(),
  getPrefill: vi.fn(),
  redirect: vi.fn((location: string) => { throw new Error(`redirect:${location}`); }),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse: vi.fn() }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ getForOwner: () => Promise.resolve({ storefrontEnabled: false, storefrontSlug: null }) }) }));
vi.mock("@/auth/payment-link", () => ({ getPaymentLinkService: () => ({ listForOwner: listV1 }) }));
vi.mock("@/auth/payment-link-v2-view", () => ({ getPaymentLinkV2ViewService: () => ({ getForOwner }) }));
vi.mock("@/auth/payment-link-v2-prefill", () => ({ getPaymentLinkV2PrefillService: () => ({ getForOwner: getPrefill }) }));

import NewPaymentLinkPage from "./page";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const sourceId = "440e8400-e29b-41d4-a716-446655440010";
const productId = "440e8400-e29b-41d4-a716-446655440030";

const ownerData = {
  links: [],
  activeProducts: [{ id: productId, internalName: "Espresso", titlePtBr: "Café expresso", titleEn: "Espresso shot", price: "12.5" }],
  activeCurrencyPairs: [{ id: "440e8400-e29b-41d4-a716-446655440020", label: "BRL/USDT" }],
};

function ready(locale: "pt-BR" | "en" = "en") {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue(locale);
  listV1.mockResolvedValue(ownerData);
  getForOwner.mockResolvedValue({ kind: "unavailable" });
  getPrefill.mockResolvedValue(null);
}

beforeEach(() => { vi.clearAllMocks(); });

describe("merchant V2 payment-link create page", () => {
  it("redirects visitors without a valid session and administrators before any read", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(NewPaymentLinkPage()).rejects.toThrow("redirect:/login");
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("administrators stay out"));
    await expect(NewPaymentLinkPage()).rejects.toThrow("redirect:/admin");
    expect(listV1).not.toHaveBeenCalled();
  });

  it.each([
    ["en", "New payment link", "Espresso shot", "BRL/USDT"],
    ["pt-BR", "Novo link de pagamento", "Café expresso", "BRL/USDT"],
  ] as const)("renders the bilingual create form posting the delivered field grammar in %s", async (locale, title, productTitle, pairLabel) => {
    ready(locale);
    const markup = renderToStaticMarkup(await NewPaymentLinkPage());
    expect(markup).toContain(title);
    expect(markup).toContain('action="/payment-links-v2"');
    expect(markup).toContain('name="compositionKind"');
    expect(markup).toContain('name="currencyPairId"');
    expect(markup).toContain('name="linkType"');
    expect(markup).toContain('name="expiresAt"');
    expect(markup).toContain('name="lines"');
    expect(markup).toContain(productTitle);
    expect(markup).toContain(pairLabel);
    // The identifier is server-generated; no identifier input exists anywhere.
    expect(markup).not.toContain('name="identifier"');
    expect(markup).not.toContain('name="version"');
  });

  it("renders the empty-picker warning and disables submission without active pairs", async () => {
    ready("en");
    listV1.mockResolvedValue({ links: [], activeProducts: ownerData.activeProducts, activeCurrencyPairs: [] });
    const markup = renderToStaticMarkup(await NewPaymentLinkPage());
    expect(markup).toContain("No active currency pair is available");
    expect(markup).toContain("disabled");
  });

  it("renders the product-lines empty-picker warning without active products", async () => {
    ready("pt-BR");
    listV1.mockResolvedValue({ links: [], activeProducts: [], activeCurrencyPairs: ownerData.activeCurrencyPairs });
    const markup = renderToStaticMarkup(await NewPaymentLinkPage());
    expect(markup).toContain("Nenhum produto ativo está disponível");
  });

  it("prefills the composition from a valid supersede source without any identifier", async () => {
    ready("en");
    getForOwner.mockResolvedValue({
      kind: "found",
      link: {
        id: sourceId,
        identifier: "abcdefghijklmnopqrstuvwx",
        sharePath: "/pay/abcdefghijklmnopqrstuvwx",
        compositionKind: "PRODUCT_LINES",
        descriptionPtBr: null,
        descriptionEn: null,
        amount: null,
        currencyPairLabel: "BRL/USDT",
        linkType: "SINGLE_USE",
        expiresAt: null,
        active: true,
        paid: false,
        state: "active",
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
        updatedAt: new Date("2026-07-02T12:00:00.000Z"),
        lines: [{ position: 1, quantity: 2, titlePtBr: "Café", titleEn: "Coffee", unitPrice: "9.9" }],
      },
    });
    getPrefill.mockResolvedValue({ version: 4, lineProductIds: [productId] });

    const markup = renderToStaticMarkup(await NewPaymentLinkPage({ searchParams: Promise.resolve({ from: sourceId }) }));
    expect(getForOwner).toHaveBeenCalledWith(principal, sourceId);
    expect(getPrefill).toHaveBeenCalledWith(principal, sourceId);
    expect(markup).toContain("New version");
    expect(markup).toContain(`[{&quot;productId&quot;:&quot;${productId}&quot;,&quot;quantity&quot;:2}]`);
    expect(markup).toContain("Espresso shot");
    expect(markup).not.toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).not.toContain('name="version"');
  });

  it("prefills fixed-amount members from a supersede source", async () => {
    ready("pt-BR");
    getForOwner.mockResolvedValue({
      kind: "found",
      link: {
        id: sourceId,
        identifier: "abcdefghijklmnopqrstuvwx",
        sharePath: "/pay/abcdefghijklmnopqrstuvwx",
        compositionKind: "FIXED_AMOUNT",
        descriptionPtBr: "Doação mensal",
        descriptionEn: "Monthly donation",
        amount: "10.50",
        currencyPairLabel: "BRL/USDT",
        linkType: "REUSABLE",
        expiresAt: null,
        active: true,
        paid: false,
        state: "active",
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
        updatedAt: new Date("2026-07-02T12:00:00.000Z"),
        lines: [],
      },
    });
    getPrefill.mockResolvedValue({ version: 1, lineProductIds: [] });

    const markup = renderToStaticMarkup(await NewPaymentLinkPage({ searchParams: Promise.resolve({ from: sourceId }) }));
    expect(markup).toContain('value="Doação mensal"');
    expect(markup).toContain('value="Monthly donation"');
    expect(markup).toContain('value="10.50"');
    expect(markup).toContain('name="descriptionPtBr"');
    expect(markup).toContain('name="amount"');
  });

  it.each([
    ["en", "This payment link is unavailable"],
    ["pt-BR", "Este link de pagamento está indisponível"],
  ] as const)("renders the one opaque unavailable view for an unresolvable source in %s", async (locale, heading) => {
    ready(locale);
    const markup = renderToStaticMarkup(await NewPaymentLinkPage({ searchParams: Promise.resolve({ from: "forged" }) }));
    expect(markup).toContain(heading);
    expect(markup).not.toContain("forged");
    expect(markup).not.toContain('action="/payment-links-v2"');
  });
});

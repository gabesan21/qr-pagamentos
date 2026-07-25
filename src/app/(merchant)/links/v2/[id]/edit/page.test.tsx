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
vi.mock("@/auth/payment-link", () => ({ getPaymentLinkService: () => ({ listForOwner: listV1 }) }));
vi.mock("@/auth/payment-link-v2-view", () => ({ getPaymentLinkV2ViewService: () => ({ getForOwner }) }));
vi.mock("@/auth/payment-link-v2-prefill", () => ({ getPaymentLinkV2PrefillService: () => ({ getForOwner: getPrefill }) }));

import EditPaymentLinkPage from "./page";

const principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const linkId = "440e8400-e29b-41d4-a716-446655440010";
const productId = "440e8400-e29b-41d4-a716-446655440030";

const fixedFound = {
  kind: "found" as const,
  link: {
    id: linkId,
    identifier: "abcdefghijklmnopqrstuvwx",
    sharePath: "/pay/abcdefghijklmnopqrstuvwx",
    compositionKind: "FIXED_AMOUNT" as const,
    descriptionPtBr: "Doação mensal",
    descriptionEn: "Monthly donation",
    amount: "10.50",
    currencyPairLabel: "BRL/USDT",
    linkType: "REUSABLE" as const,
    expiresAt: new Date("2027-08-01T12:30:00.000Z"),
    active: true,
    paid: false,
    state: "active" as const,
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    lines: [],
  },
};

function ready(locale: "pt-BR" | "en" = "en") {
  requireOwnerFromCookie.mockResolvedValue(principal);
  resolveLocale.mockResolvedValue(locale);
  listV1.mockResolvedValue({
    links: [],
    activeProducts: [{ id: productId, internalName: "Espresso", titlePtBr: "Café expresso", titleEn: "Espresso shot", price: "12.5" }],
    activeCurrencyPairs: [{ id: "440e8400-e29b-41d4-a716-446655440020", label: "BRL/USDT" }],
  });
  getForOwner.mockResolvedValue(fixedFound);
  getPrefill.mockResolvedValue({ version: 5, lineProductIds: [] });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("merchant V2 payment-link edit page", () => {
  it("redirects visitors without a valid session and administrators before any read", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new UnauthenticatedError("no session"));
    await expect(EditPaymentLinkPage({ params: Promise.resolve({ id: linkId }) })).rejects.toThrow("redirect:/login");
    requireOwnerFromCookie.mockRejectedValueOnce(new ForbiddenError("administrators stay out"));
    await expect(EditPaymentLinkPage({ params: Promise.resolve({ id: linkId }) })).rejects.toThrow("redirect:/admin");
    expect(getForOwner).not.toHaveBeenCalled();
  });

  it("posts the edit action with the prefilled version CAS and prefilled UTC expiry", async () => {
    ready("en");
    const markup = renderToStaticMarkup(await EditPaymentLinkPage({ params: Promise.resolve({ id: linkId }) }));
    expect(markup).toContain(`action="/payment-links-v2/${linkId}"`);
    expect(markup).toContain('value="edit"');
    expect(markup).toContain('name="version"');
    expect(markup).toContain('value="5"');
    expect(markup).toContain('value="2027-08-01T12:30"');
    // Immutable kind, type, and pair stay read-only facts with no selects.
    expect(markup).toContain("Fixed amount");
    expect(markup).toContain("BRL/USDT");
    expect(markup).not.toContain('name="compositionKind"');
    expect(markup).not.toContain('name="currencyPairId"');
    expect(markup).not.toContain('name="linkType"');
    expect(markup).not.toContain("abcdefghijklmnopqrstuvwx");
  });

  it("leaves every financial member and the expiry unnamed until a real change", async () => {
    ready("en");
    const markup = renderToStaticMarkup(await EditPaymentLinkPage({ params: Promise.resolve({ id: linkId }) }));
    expect(markup).not.toContain('name="descriptionPtBr"');
    expect(markup).not.toContain('name="descriptionEn"');
    expect(markup).not.toContain('name="amount"');
    expect(markup).not.toContain('name="expiresAt"');
    expect(markup).not.toContain('name="lines"');
    expect(markup).toContain('value="Doação mensal"');
    expect(markup).toContain('value="10.50"');
  });

  it("carries the bilingual attempt-lock explanation and the supersede affordance", async () => {
    ready("pt-BR");
    const markup = renderToStaticMarkup(await EditPaymentLinkPage({ params: Promise.resolve({ id: linkId }) }));
    expect(markup).toContain("A composição bloqueia após a primeira tentativa de checkout");
    expect(markup).toContain(`href="/links/new?from=${linkId}"`);
    expect(markup).toContain("Criar uma nova versão");
    expect(markup).toContain(`href="/links/v2/${linkId}"`);
  });

  it("prefills ordered line product identifiers from the seam over the redacted view", async () => {
    ready("en");
    getForOwner.mockResolvedValue({
      kind: "found",
      link: {
        ...fixedFound.link,
        compositionKind: "PRODUCT_LINES",
        descriptionPtBr: null,
        descriptionEn: null,
        amount: null,
        lines: [{ position: 1, quantity: 2, titlePtBr: "Café", titleEn: "Coffee", unitPrice: "9.9" }],
      },
    });
    getPrefill.mockResolvedValue({ version: 8, lineProductIds: [productId] });

    const markup = renderToStaticMarkup(await EditPaymentLinkPage({ params: Promise.resolve({ id: linkId }) }));
    expect(markup).toContain("Espresso shot");
    expect(markup).toContain('value="8"');
    // The lines JSON stays unnamed until the first change (no attempt-gate trip).
    expect(markup).not.toContain('name="lines"');
    expect(markup).toContain(`[{&quot;productId&quot;:&quot;${productId}&quot;,&quot;quantity&quot;:2}]`);
  });

  it.each([
    ["en", "This payment link is unavailable"],
    ["pt-BR", "Este link de pagamento está indisponível"],
  ] as const)("renders the one opaque unavailable view for cross-owner, malformed, or missing identities in %s", async (locale, heading) => {
    ready(locale);
    getForOwner.mockResolvedValue({ kind: "unavailable" });
    getPrefill.mockResolvedValue(null);

    const markup = renderToStaticMarkup(await EditPaymentLinkPage({ params: Promise.resolve({ id: "forged" }) }));
    expect(markup).toContain(heading);
    expect(markup).not.toContain("forged");
    expect(markup).not.toContain("abcdefghijklmnopqrstuvwx");
    expect(markup).not.toContain(`action="/payment-links-v2/${linkId}"`);
  });
});

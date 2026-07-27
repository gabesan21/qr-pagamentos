import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
const { read, readV2, resolve, resolveLocale } = vi.hoisted(() => ({ read: vi.fn(), readV2: vi.fn(), resolve: vi.fn(), resolveLocale: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get }) }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve }) }));
vi.mock("@/checkout/public-checkout-presentation", () => ({ getPublicCheckoutPresentationService: () => ({ read }) }));
vi.mock("@/checkout/public-checkout-v2-presentation", () => ({ getPublicCheckoutV2PresentationService: () => ({ read: readV2 }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));

import PublicCheckoutPage from "./page";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";

describe("public checkout page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readV2.mockResolvedValue(null);
  });

  it("renders the exact projection with policy-driven fields and shared primitives", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce({ product: { title: "Donation", description: "Support the project.", price: "12.50" }, checkoutPolicy: "NAME_EMAIL_CPF_ADDRESS" });
    const markup = renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) }));

    expect(read).toHaveBeenCalledWith(identifier, "pt-BR");
    expect(markup).toContain("Donation");
    expect(markup).toContain('for="checkout-name"');
    expect(markup).toContain('for="checkout-email"');
    expect(markup).toContain('for="checkout-cpf"');
    expect(markup).toContain('for="checkout-street"');
    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="field-set"');
    expect(markup).not.toContain("currencyUuid");
  });

  it("renders a generic unavailable state without a form", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) }));

    expect(markup).toContain("Este link de pagamento está indisponível");
    expect(markup).not.toContain('data-slot="field-group"');
  });

  it("uses the persisted UI locale instead of Accept-Language when a principal is present", async () => {
    get.mockReturnValue({ value: "session-token" });
    resolve.mockResolvedValueOnce({ id: "account-id" });
    resolveLocale.mockResolvedValueOnce("en");
    read.mockResolvedValueOnce({ product: { title: "Donation", description: "Support the project.", price: "12.50" }, checkoutPolicy: "NONE" });

    await PublicCheckoutPage({ params: Promise.resolve({ identifier }) });

    expect(resolve).toHaveBeenCalledWith("session-token");
    expect(resolveLocale).toHaveBeenCalledWith("account-id");
    expect(read).toHaveBeenCalledWith(identifier, "en");
  });

  it("keeps V1 resolution first and never reads the V2 presentation while V1 resolves", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce({ product: { title: "Donation", description: "Support the project.", price: "12.50" }, checkoutPolicy: "NONE" });

    await PublicCheckoutPage({ params: Promise.resolve({ identifier }) });

    expect(readV2).not.toHaveBeenCalled();
  });

  it("renders the branded two-column V2 composition only on a V1 miss", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce(null);
    readV2.mockResolvedValueOnce({
      composition: {
        kind: "PRODUCT_LINES",
        lines: [
          { product: { title: "Espresso shot", description: "Freshly pulled", price: "12.5" }, quantity: 2 },
          { product: { title: "Filter coffee", description: "Slow brewed", price: "9.9" }, quantity: 1 },
        ],
        total: "34.9",
      },
      currencyCode: "BRL",
      checkoutPolicy: "NAME_EMAIL",
      branding: { displayName: "Ana's Coffee", accentColor: "#125448", themeId: "vault-blue", logoMediaIdentifier: "logo-media-identifier-00000000000000000" },
    });
    const markup = renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) })).replaceAll("<!-- -->", "");

    expect(readV2).toHaveBeenCalledWith(identifier, "pt-BR");
    expect(markup).toContain('data-theme-preview="vault-blue"');
    expect(markup).toContain("--storefront-accent:#125448");
    expect(markup).toContain("/media/logo-media-identifier-00000000000000000");
    expect(markup).toContain("Ana&#x27;s Coffee");
    expect(markup).toContain("Espresso shot");
    expect(markup).toContain("2 × 12.5");
    expect(markup).toContain("34.9");
    expect(markup).toContain("BRL");
    expect(markup).toContain('for="checkout-name"');
    expect(markup).toContain('for="checkout-email"');
    expect(markup).not.toContain('for="checkout-cpf"');
    expect(markup).not.toContain("currencyUuid");
    expect(markup).not.toContain("checkoutDataPolicy");
  });

  it("renders the fixed-amount V2 composition with the fallback identity and the unlabeled treatment", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce(null);
    readV2.mockResolvedValueOnce({
      composition: { kind: "FIXED_AMOUNT", description: "Monthly donation", amount: "10.50" },
      currencyCode: null,
      checkoutPolicy: "NONE",
      branding: { displayName: null, accentColor: null, themeId: "pix-paper", logoMediaIdentifier: null },
    });
    const markup = renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) })).replaceAll("<!-- -->", "");

    expect(markup).toContain('data-theme-preview="pix-paper"');
    expect(markup).toContain('data-brand-identity="merchant-fallback"');
    expect(markup).toContain("Monthly donation");
    expect(markup).toContain("10.50");
    expect(markup).toContain("moeda sem rótulo");
    expect(markup).toContain("Este pagamento não exige dados do cliente.");
    expect(markup).not.toContain("/media/");
  });

  it("renders the one opaque unavailable view when neither presentation resolves", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) }));

    expect(readV2).toHaveBeenCalledWith(identifier, "pt-BR");
    expect(markup).toContain("Este link de pagamento está indisponível");
    expect(markup).not.toContain('data-slot="field-group"');
    expect(markup).not.toContain('data-theme-preview');
  });
});

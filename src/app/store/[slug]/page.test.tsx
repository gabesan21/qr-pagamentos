import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
const { read, resolve, resolveLocale } = vi.hoisted(() => ({ read: vi.fn(), resolve: vi.fn(), resolveLocale: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get }) }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/storefront/public-storefront", () => ({ getPublicStorefrontService: () => ({ read }) }));

import PublicStorefrontPage from "./page";

function textContent(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const coffeeReference = "11111111-1111-4111-8111-111111111111";
const teaReference = "22222222-2222-4222-8222-222222222222";

const storefront = {
  displayName: "Loja da Ana",
  accentColor: "#106B5B",
  themeId: "vault-blue",
  layout: "boxed",
  logoMediaIdentifier: null,
  products: [{ title: "Café", description: "Café especial.", price: "12.5", paymentLinkIdentifier: "AbCdEfGhIjKlMnOpQrStUvWx" }],
  catalog: [
    {
      name: "Cafés",
      products: [
        {
          reference: coffeeReference,
          title: "Café",
          description: "Café especial.",
          price: "12.5",
          currencyCode: "BRL",
          imageMediaIdentifier: null,
          available: true,
        },
      ],
    },
    {
      name: null,
      products: [
        {
          reference: teaReference,
          title: "Chá",
          description: "Chá verde.",
          price: "9",
          currencyCode: null,
          imageMediaIdentifier: null,
          available: true,
        },
      ],
    },
  ],
  standalonePayments: true,
  standalonePaymentCurrencyCode: "BRL",
} as const;

describe("public storefront page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes the owner theme and accent, renders the grouped catalog, and keeps the custom amount first", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce(storefront);

    const markup = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "ana-store" }) }));

    expect(read).toHaveBeenCalledWith("ana-store", "pt-BR");
    expect(markup).toContain('data-theme-preview="vault-blue"');
    expect(markup).toContain('style="--storefront-accent:#106B5B"');
    expect(textContent(markup)).toContain("Loja da Ana");
    // Converged (14.6.1's `CheckoutMerchantHeader`): a display name without a
    // logo renders the initials `Monogram`, never the merchant fallback mark.
    expect(textContent(markup)).toContain("LD");
    expect(markup).not.toContain('data-brand-identity="merchant-fallback"');
    expect(markup).toContain("Pagamento seguro processado por QR Pagamentos");
    // C1: the shared public footer (powered-by + `LanguageSwitcher`) renders
    // on the storefront exactly as it does on the standalone checkout.
    expect(markup).toContain("Desenvolvido por QR Pagamentos");
    expect(markup).toContain('name="locale"');
    expect(textContent(markup)).toContain("Cafés");
    expect(textContent(markup)).toContain("Mais produtos");
    expect(textContent(markup)).toContain("Café especial.");
    expect(textContent(markup)).toContain("12.5 BRL");
    expect(textContent(markup)).toContain("Valor livre");
    expect(textContent(markup)).toContain("Valor (BRL)");
    expect(textContent(markup)).toContain("Adicionar ao carrinho");
    expect(textContent(markup)).toContain("Carrinho");
    expect(textContent(markup)).toContain("Seu carrinho está vazio.");
    expect(markup).toContain('aria-label="Diminuir a quantidade"');
    expect(markup).toContain('aria-label="Aumentar a quantidade"');
    expect(textContent(markup).indexOf("Valor livre")).toBeLessThan(textContent(markup).indexOf("Cafés"));
    // The V1 link-driven list no longer renders; /pay links stay direct-only.
    expect(markup).not.toContain('href="/pay/');
    // Redaction: no owner, provider, toggle, or internal field leaks.
    for (const forbidden of ["ownerId", "checkoutDataPolicy", "standalonePaymentsEnabled", coffeeReference, teaReference, "AbCdEfGhIjKlMnOpQrStUvWx"]) {
      expect(markup).not.toContain(forbidden);
    }
  });

  it("renders the table layout with ruled rows and the quantity column", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce({ ...storefront, layout: "table", themeId: "pix-paper" });

    const markup = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "ana-store" }) }));

    expect(markup).toContain('data-layout="table"');
    expect(textContent(markup)).toContain("Quantidade");
    expect(markup).toContain("<table");
    expect(textContent(markup)).toContain("Chá verde.");
  });

  it("renders the merchant logo through the media read route with a localized alt", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce({ ...storefront, logoMediaIdentifier: "l".repeat(43) });

    const markup = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "ana-store" }) }));

    expect(markup).toContain(`src="/media/${"l".repeat(43)}"`);
    expect(markup).toContain('alt="Logotipo da loja"');
    expect(markup).not.toContain('data-brand-identity="merchant-fallback"');
  });

  it("uses the persisted locale for an authenticated visitor", async () => {
    get.mockReturnValue({ value: "session-token" });
    resolve.mockResolvedValueOnce({ id: "account-id" });
    resolveLocale.mockResolvedValueOnce("en");
    read.mockResolvedValueOnce({ ...storefront, displayName: null });

    const markup = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "ana-store" }) }));

    expect(read).toHaveBeenCalledWith("ana-store", "en");
    expect(textContent(markup)).toContain("QR Pagamentos storefront");
    expect(textContent(markup)).toContain("Custom amount");
    expect(textContent(markup)).toContain("Your cart is empty.");
    expect(textContent(markup)).toContain("More products");
  });

  it("treats the standalone item alone as a non-empty store and the plain empty state otherwise", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce({ ...storefront, catalog: [] });
    const standaloneOnly = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "ana-store" }) }));
    expect(textContent(standaloneOnly)).toContain("Valor livre");
    expect(textContent(standaloneOnly)).not.toContain("Nenhum produto está disponível agora.");

    read.mockResolvedValueOnce({ ...storefront, catalog: [], standalonePayments: false });
    const empty = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "ana-store" }) }));
    expect(textContent(empty)).toContain("Nenhum produto está disponível agora.");
    expect(textContent(empty)).not.toContain("Carrinho");
    expect(empty).toContain('data-state="empty"');
  });

  it("uses one opaque unavailable state for unknown, disabled, and malformed storefronts", async () => {
    get.mockReturnValue(undefined);
    read.mockResolvedValueOnce(null);

    const markup = renderToStaticMarkup(await PublicStorefrontPage({ params: Promise.resolve({ slug: "unknown" }) }));

    expect(read).toHaveBeenCalledWith("unknown", "pt-BR");
    expect(textContent(markup)).toContain("Esta vitrine está indisponível");
    expect(markup).not.toContain('data-theme-preview');
    expect(textContent(markup)).not.toContain("Carrinho");
    expect(markup).toContain('data-state="unavailable"');
  });
});

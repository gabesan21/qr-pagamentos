import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { storefrontPtBR } from "@/i18n/dictionaries/storefront/pt-BR";
import { getDictionary } from "@/i18n/dictionaries";

import {
  StandaloneStorefrontExperience,
  StorefrontExperienceView,
  standalonePaymentPrefillHref,
  submitStorefrontCartCheckout,
  type StorefrontExperienceCopy,
} from "./storefront-experience";

function textContent(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const coffeeReference = "11111111-1111-4111-8111-111111111111";
const teaReference = "22222222-2222-4222-8222-222222222222";
const dictionary = getDictionary("pt-BR");

const copy: StorefrontExperienceCopy = {
  cartCheckout: storefrontPtBR.storefrontCartCheckout,
  cartCheckoutFailed: storefrontPtBR.storefrontCartCheckoutFailed,
  cartEmpty: storefrontPtBR.storefrontCartEmpty,
  cartHeading: storefrontPtBR.storefrontCartHeading,
  cartRemove: storefrontPtBR.storefrontCartRemove,
  cartTotalLabel: storefrontPtBR.storefrontCartTotalLabel,
  cartUpdated: storefrontPtBR.storefrontCartUpdated,
  customAmountDescription: storefrontPtBR.storefrontCustomAmountDescription,
  customAmountInvalid: storefrontPtBR.storefrontCustomAmountInvalid,
  customAmountLabel: storefrontPtBR.storefrontCustomAmountLabel,
  customAmountPlaceholder: storefrontPtBR.storefrontCustomAmountPlaceholder,
  customAmountPay: storefrontPtBR.storefrontCustomAmountPay,
  customAmountTitle: storefrontPtBR.storefrontCustomAmountTitle,
  decreaseQuantity: storefrontPtBR.storefrontDecreaseQuantity,
  groupUncategorized: storefrontPtBR.storefrontGroupUncategorized,
  increaseQuantity: storefrontPtBR.storefrontIncreaseQuantity,
  paginationLabel: storefrontPtBR.storefrontPaginationLabel,
  paginationNext: storefrontPtBR.storefrontPaginationNext,
  paginationPrevious: storefrontPtBR.storefrontPaginationPrevious,
  paginationStatus: storefrontPtBR.storefrontPaginationStatus,
  priceLabel: storefrontPtBR.storefrontPriceLabel,
  productsHeading: storefrontPtBR.storefrontProductsHeading,
  quantityLabel: storefrontPtBR.storefrontQuantityLabel,
  viewCards: storefrontPtBR.storefrontViewCards,
  viewLabel: storefrontPtBR.storefrontViewLabel,
  viewList: storefrontPtBR.storefrontViewList,
};

const catalog = [
  {
    name: "Cafés",
    products: [
      {
        reference: coffeeReference,
        title: "Café",
        description: "Café especial.",
        price: "12.5",
        currencyCode: "BRL",
        imageMediaIdentifier: "p".repeat(43),
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
] as const;

// 13 products in one group: one more than a page.
const manyProducts = [
  {
    name: "Lote",
    products: Array.from({ length: 13 }, (_, index) => ({
      reference: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      title: `Item ${String(index + 1).padStart(2, "0")}`,
      description: "",
      price: "1",
      currencyCode: "BRL",
      imageMediaIdentifier: null,
      available: true,
    })),
  },
];

function renderView(overrides: Partial<Parameters<typeof StorefrontExperienceView>[0]> = {}) {
  return renderToStaticMarkup(
    <StorefrontExperienceView
      amountDraft=""
      amountInvalid={false}
      catalog={catalog}
      checkoutFailed={false}
      checkoutPending={false}
      copy={copy}
      items={[]}
      onAmountDraftChange={vi.fn()}
      onAmountSubmit={vi.fn()}
      onCheckout={vi.fn()}
      onPageChange={vi.fn()}
      onQuantityCommit={vi.fn()}
      onRemove={vi.fn()}
      onViewChange={vi.fn()}
      page={1}
      recovered={false}
      standalonePaymentCurrencyCode="BRL"
      standalonePayments
      view="cards"
      {...overrides}
    />,
  );
}

describe("storefront experience view", () => {
  it("renders the two-column grid with the free-amount card first, then the catalog and the cart", () => {
    const markup = renderView();
    const text = textContent(markup);

    expect(markup).toContain("lg:grid-cols-[minmax(0,1fr)_calc(var(--space-12)*8)]");
    expect(markup).toContain('data-view="cards"');
    expect(text.indexOf("Valor livre")).toBeLessThan(text.indexOf("Cafés"));
    expect(text.indexOf("Cafés")).toBeLessThan(text.indexOf("Seu carrinho"));
    expect(markup).toContain(`src="/media/${"p".repeat(43)}"`);
    expect(markup).toContain('value="0"');
    expect(markup).toContain('aria-label="Diminuir a quantidade"');
    expect(markup).toContain('aria-label="Aumentar a quantidade"');
    expect(text).toContain("Seu carrinho está vazio.");
    expect(text).not.toContain("Seu carrinho foi atualizado");
    expect(text).toContain("Mais produtos");
  });

  it("renders the free amount as a pay-now form that never adds to the cart", () => {
    const markup = renderView();

    expect(markup).toMatch(/<form[^>]*>/);
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*>Pagar agora<\/button>/);
    expect(markup).toContain('placeholder="R$ 0,00"');
    expect(textContent(markup)).not.toContain("Adicionar ao carrinho");
    expect(textContent(markup)).not.toContain("Atualizar o carrinho");
  });

  it("switches between cards and list rendering and exposes the active toggle option", () => {
    const cards = renderView({ view: "cards" });
    expect(cards).toContain('data-view="cards"');
    expect(cards).toContain("sm:grid-cols-2");
    expect(cards).not.toContain("<table");
    expect(cards).toMatch(/aria-pressed="true"[^>]*>(?:<svg[^>]*><\/svg>|<svg.*?<\/svg>)?Cartões/);
    expect(cards).toMatch(/aria-pressed="false"[^>]*>(?:<svg.*?<\/svg>)?Lista/);

    const list = renderView({ view: "list" });
    expect(list).toContain('data-view="list"');
    expect(list).toContain("<table");
    expect(list).not.toContain("sm:grid-cols-2");
    expect(textContent(list)).toContain("Quantidade");
    expect(textContent(list)).toContain("Chá verde.");
    expect(list).toMatch(/aria-pressed="true"[^>]*>(?:<svg.*?<\/svg>)?Lista/);
  });

  it("paginates a 13-product catalog at 12 per page with status and boundary controls", () => {
    const pageOne = renderView({ catalog: manyProducts, page: 1 });
    const titlesOne = textContent(pageOne).match(/Item \d{2}/g) ?? [];
    expect(new Set(titlesOne).size).toBe(12);
    expect(textContent(pageOne)).not.toContain("Item 13");
    expect(textContent(pageOne)).toContain("Página 1 de 2");
    expect(pageOne).toMatch(/<button[^>]*\sdisabled=""[^>]*>Anterior<\/button>/);
    expect(pageOne).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>Próxima<\/button>/);

    const pageTwo = renderView({ catalog: manyProducts, page: 2 });
    expect(textContent(pageTwo).match(/Item \d{2}/g)).toEqual(["Item 13"]);
    expect(textContent(pageTwo)).toContain("Página 2 de 2");
    expect(pageTwo).toMatch(/<button[^>]*\sdisabled=""[^>]*>Próxima<\/button>/);
  });

  it("renders no pagination navigation for a single page", () => {
    const markup = renderView();
    expect(markup).not.toContain('aria-label="Páginas de produtos"');
    expect(textContent(markup)).not.toContain("Página 1 de");
  });

  it("omits the free-amount card when standalone payments are off", () => {
    const markup = renderView({ standalonePayments: false });

    expect(textContent(markup)).not.toContain("Valor livre");
    expect(markup).not.toContain("lg:grid-rows-[auto_1fr]");
    expect(textContent(markup)).toContain("Cafés");
  });

  it("renders the populated product-only cart with exact line totals grouped per currency, never summed across", () => {
    const markup = renderView({
      items: [
        { kind: "product", reference: coffeeReference, quantity: 2 },
        { kind: "product", reference: teaReference, quantity: 3 },
      ],
    });

    expect(markup).toContain('value="2"');
    expect(textContent(markup)).toContain("2 × R$ 12,50");
    expect(textContent(markup)).toContain("3 × 9");
    expect(textContent(markup)).toContain("R$ 25,00");
    expect(textContent(markup)).toContain("Total (BRL)");
    expect(textContent(markup)).toContain("27");
    expect(textContent(markup)).not.toContain("52");
    expect(markup).toContain('aria-label="Remover: Café"');
    expect(markup).not.toContain('aria-label="Remover: Valor livre"');
    expect(textContent(markup)).not.toContain("Seu carrinho está vazio.");
    expect(textContent(markup)).toContain("Ir para o pagamento");
  });

  it("formats exact cart totals without relabeling a distinct currency as BRL", () => {
    const markup = renderView({
      locale: "en",
      catalog: [{
        ...catalog[0],
        products: [{ ...catalog[0].products[0], price: "1234.5", currencyCode: "USD" }],
      }],
      items: [{ kind: "product", reference: coffeeReference, quantity: 2 }],
    });

    expect(textContent(markup)).toContain("2 × 1,234.50 USD");
    expect(textContent(markup)).toContain("2,469.00 USD");
    expect(textContent(markup)).not.toContain("R$");
  });

  it("announces the recovered-cart notice exactly once and flags an invalid custom amount", () => {
    const markup = renderView({ amountDraft: "0", amountInvalid: true, recovered: true });

    expect(textContent(markup)).toContain("Seu carrinho foi atualizado porque esta loja mudou.");
    expect(textContent(markup).match(/carrinho foi atualizado/g)).toHaveLength(1);
    expect(textContent(markup)).toContain("Informe um valor válido maior que zero");
    expect(markup).toContain('aria-invalid="true"');
  });

  it("renders the checkout control for any populated cart and never for an empty one", () => {
    const populated = renderView({ items: [{ kind: "product", reference: coffeeReference, quantity: 2 }] });
    expect(textContent(populated)).toContain("Ir para o pagamento");
    expect(textContent(populated).match(/Ir para o pagamento/g)).toHaveLength(1);

    const empty = renderView();
    expect(textContent(empty)).not.toContain("Ir para o pagamento");
  });

  it("disables the pending checkout control and announces the opaque failure", () => {
    const items = [{ kind: "product" as const, reference: coffeeReference, quantity: 1 }];
    const pending = renderView({ items, checkoutPending: true });
    expect(textContent(pending)).toContain("Ir para o pagamento");
    expect(pending).toContain("disabled");
    expect(pending).toContain('aria-busy="true"');

    const failed = renderView({ items, checkoutFailed: true });
    expect(textContent(failed)).toContain("Não foi possível iniciar o pagamento deste carrinho. Tente novamente.");
    expect(textContent(failed).match(/Não foi possível iniciar o pagamento/g)).toHaveLength(1);
  });
});

describe("standalone storefront experience", () => {
  it("uses only canonical positive-decimal values for the standalone payment prefill", () => {
    expect(standalonePaymentPrefillHref("minha-loja", "12.500001")).toBe("/store/minha-loja/pay?amount=12.500001");
    expect(standalonePaymentPrefillHref("minha-loja", "12,5")).toBeNull();
    expect(standalonePaymentPrefillHref("minha-loja", "0")).toBeNull();
  });

  it("mounts the standalone payment flow with no cart or pay-page redirect", () => {
    const markup = renderToStaticMarkup(
      <StandaloneStorefrontExperience currencyCode="BRL" dictionary={dictionary} policy="NONE" slug="minha-loja" />,
    );

    expect(markup).toContain('id="standalone-amount"');
    expect(markup).not.toContain("/store/minha-loja/pay?");
    expect(textContent(markup)).not.toContain("Carrinho");
  });

  it("renders the compact unavailable state without a cart or a fallback currency", () => {
    const markup = renderToStaticMarkup(
      <StandaloneStorefrontExperience currencyCode={null} dictionary={dictionary} policy="NONE" slug="minha-loja" />,
    );

    expect(textContent(markup)).toContain("Quanto você deseja pagar?");
    expect(textContent(markup)).toContain("Os pagamentos estarão disponíveis quando esta loja configurar uma moeda.");
    expect(textContent(markup).match(/configurar uma moeda/g)).toHaveLength(1);
    expect(markup).toContain("disabled");
    expect(markup).not.toContain("BRL");
    expect(textContent(markup)).not.toContain("Carrinho");
    expect(textContent(markup)).not.toContain("Adicionar ao carrinho");
  });
});

describe("submitStorefrontCartCheckout", () => {
  const slug = "minha-loja";
  const items = [
    { kind: "product" as const, reference: coffeeReference, quantity: 2 },
    { kind: "product" as const, reference: teaReference, quantity: 1 },
  ];

  it("posts only product identity and quantity and accepts the exact 201 contract", async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify({ paymentLinkIdentifier: "a".repeat(24) }), { status: 201 }));
    const outcome = await submitStorefrontCartCheckout(slug, items, fetchImplementation);

    expect(outcome).toEqual({ kind: "issued", paymentLinkIdentifier: "a".repeat(24) });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/store/${slug}/cart/checkout`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      items: [
        { reference: coffeeReference, quantity: 2 },
        { reference: teaReference, quantity: 1 },
      ],
    });
  });

  it("refuses an empty cart without a request", async () => {
    const fetchImplementation = vi.fn();
    await expect(submitStorefrontCartCheckout(slug, [], fetchImplementation)).resolves.toEqual({ kind: "failed" });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-201 response", async () => new Response(null, { status: 400 })],
    ["a network failure", async () => { throw new Error("offline"); }],
    ["an unparseable payload", async () => new Response("{", { status: 201 })],
    ["a foreign payload key", async () => new Response(JSON.stringify({ identifier: "a".repeat(24) }), { status: 201 })],
    ["a malformed identifier", async () => new Response(JSON.stringify({ paymentLinkIdentifier: "../admin" }), { status: 201 })],
  ])("fails opaquely on %s", async (_label, fetchImplementation) => {
    await expect(submitStorefrontCartCheckout(slug, items, fetchImplementation)).resolves.toEqual({ kind: "failed" });
  });
});

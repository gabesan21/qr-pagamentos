import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { storefrontPtBR } from "@/i18n/dictionaries/storefront/pt-BR";

import { StorefrontExperienceView, submitStorefrontCartCheckout, type StorefrontExperienceCopy } from "./storefront-experience";

const coffeeReference = "11111111-1111-4111-8111-111111111111";
const teaReference = "22222222-2222-4222-8222-222222222222";

const copy: StorefrontExperienceCopy = {
  cartCheckout: storefrontPtBR.storefrontCartCheckout,
  cartCheckoutFailed: storefrontPtBR.storefrontCartCheckoutFailed,
  cartEmpty: storefrontPtBR.storefrontCartEmpty,
  cartHeading: storefrontPtBR.storefrontCartHeading,
  cartRemove: storefrontPtBR.storefrontCartRemove,
  cartTotalLabel: storefrontPtBR.storefrontCartTotalLabel,
  cartUpdated: storefrontPtBR.storefrontCartUpdated,
  customAmountAdd: storefrontPtBR.storefrontCustomAmountAdd,
  customAmountDescription: storefrontPtBR.storefrontCustomAmountDescription,
  customAmountInvalid: storefrontPtBR.storefrontCustomAmountInvalid,
  customAmountLabel: storefrontPtBR.storefrontCustomAmountLabel,
  customAmountTitle: storefrontPtBR.storefrontCustomAmountTitle,
  customAmountUpdate: storefrontPtBR.storefrontCustomAmountUpdate,
  decreaseQuantity: storefrontPtBR.storefrontDecreaseQuantity,
  groupUncategorized: storefrontPtBR.storefrontGroupUncategorized,
  increaseQuantity: storefrontPtBR.storefrontIncreaseQuantity,
  priceLabel: storefrontPtBR.storefrontPriceLabel,
  productsHeading: storefrontPtBR.storefrontProductsHeading,
  quantityLabel: storefrontPtBR.storefrontQuantityLabel,
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
      layout="boxed"
      onAmountDraftChange={vi.fn()}
      onAmountSubmit={vi.fn()}
      onCheckout={vi.fn()}
      onQuantityCommit={vi.fn()}
      onRemove={vi.fn()}
      recovered={false}
      standalonePaymentCurrencyCode="BRL"
      standalonePayments
      {...overrides}
    />,
  );
}

describe("storefront experience view", () => {
  it("renders the boxed catalog with the standalone item first, images, steppers, and the empty cart", () => {
    const markup = renderView();

    expect(markup).toContain('data-layout="boxed"');
    expect(markup.indexOf("Valor livre")).toBeLessThan(markup.indexOf("Cafés"));
    expect(markup).toContain(`src="/media/${"p".repeat(43)}"`);
    expect(markup).toContain('value="0"');
    expect(markup).toContain('aria-label="Diminuir a quantidade"');
    expect(markup).toContain('aria-label="Aumentar a quantidade"');
    expect(markup).toContain("Seu carrinho está vazio.");
    expect(markup).not.toContain("Seu carrinho foi atualizado");
    expect(markup).toContain("Mais produtos");
  });

  it("renders the table layout with ruled rows and the standalone row first", () => {
    const markup = renderView({ layout: "table" });

    expect(markup).toContain('data-layout="table"');
    expect(markup).toContain("Quantidade");
    expect(markup.indexOf("Valor livre")).toBeLessThan(markup.indexOf("Cafés"));
    expect(markup).toContain("Chá verde.");
  });

  it("omits the standalone item when standalone payments are off", () => {
    const markup = renderView({ standalonePayments: false });

    expect(markup).not.toContain("Valor livre");
    expect(markup).toContain("Cafés");
  });

  it("renders the populated cart with exact line totals grouped per currency, never summed across", () => {
    const markup = renderView({
      amountDraft: "5",
      items: [
        { kind: "custom-amount", amount: "5" },
        { kind: "product", reference: coffeeReference, quantity: 2 },
        { kind: "product", reference: teaReference, quantity: 3 },
      ],
    });

    expect(markup).toContain("Atualizar o carrinho");
    expect(markup).toContain('value="5"');
    expect(markup).toContain('value="2"');
    expect(markup).toContain("2 × 12.5 BRL");
    expect(markup).toContain("3 × 9");
    expect(markup).toContain("25 BRL");
    expect(markup).toContain("Total (BRL)");
    expect(markup).toContain("<strong>30</strong>");
    expect(markup).toContain("<strong>27</strong>");
    expect(markup).not.toContain("57");
    expect(markup).toContain('aria-label="Remover: Café"');
    expect(markup).toContain('aria-label="Remover: Valor livre"');
    expect(markup).not.toContain("Seu carrinho está vazio.");
  });

  it("announces the recovered-cart notice exactly once and flags an invalid custom amount", () => {
    const markup = renderView({ amountDraft: "0", amountInvalid: true, recovered: true });

    expect(markup).toContain("Seu carrinho foi atualizado porque esta loja mudou.");
    expect(markup.match(/carrinho foi atualizado/g)).toHaveLength(1);
    expect(markup).toContain("Informe um valor válido maior que zero");
    expect(markup).toContain('aria-invalid="true"');
  });

  it("renders the checkout control only for a populated product-only cart", () => {
    const productOnly = renderView({ items: [{ kind: "product", reference: coffeeReference, quantity: 2 }] });
    expect(productOnly).toContain("Ir para o pagamento");
    expect(productOnly.match(/Ir para o pagamento/g)).toHaveLength(1);

    const withCustomAmount = renderView({
      items: [{ kind: "custom-amount", amount: "5" }, { kind: "product", reference: coffeeReference, quantity: 2 }],
    });
    expect(withCustomAmount).not.toContain("Ir para o pagamento");

    const empty = renderView();
    expect(empty).not.toContain("Ir para o pagamento");
  });

  it("disables the pending checkout control and announces the opaque failure", () => {
    const items = [{ kind: "product" as const, reference: coffeeReference, quantity: 1 }];
    const pending = renderView({ items, checkoutPending: true });
    expect(pending).toContain("Ir para o pagamento");
    expect(pending).toContain("disabled");
    expect(pending).toContain('aria-busy="true"');

    const failed = renderView({ items, checkoutFailed: true });
    expect(failed).toContain("Não foi possível iniciar o pagamento deste carrinho. Tente novamente.");
    expect(failed.match(/Não foi possível iniciar o pagamento/g)).toHaveLength(1);
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

  it("refuses a custom-amount member or an empty cart without a request", async () => {
    const fetchImplementation = vi.fn();
    await expect(submitStorefrontCartCheckout(slug, [{ kind: "custom-amount", amount: "5" }, ...items], fetchImplementation)).resolves.toEqual({ kind: "failed" });
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

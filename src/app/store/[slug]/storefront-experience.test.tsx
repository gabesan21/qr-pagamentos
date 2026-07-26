import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { storefrontPtBR } from "@/i18n/dictionaries/storefront/pt-BR";

import { StorefrontExperienceView, type StorefrontExperienceCopy } from "./storefront-experience";

const coffeeReference = "11111111-1111-4111-8111-111111111111";
const teaReference = "22222222-2222-4222-8222-222222222222";

const copy: StorefrontExperienceCopy = {
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
      copy={copy}
      items={[]}
      layout="boxed"
      onAmountDraftChange={vi.fn()}
      onAmountSubmit={vi.fn()}
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
});

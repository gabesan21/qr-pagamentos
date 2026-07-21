import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";
import { PaymentLinkManagement } from "./payment-link-management";

const populated = {
  activeProducts: [{ id: "product", internalName: "Donation", titlePtBr: "Doação", titleEn: "Donation", price: "1234.56" }],
  activeCurrencyPairs: [{ id: "pair", label: "BRL/USDT" }],
  links: [{ id: "link", identifier: "AbCdEfGhIjKlMnOpQrStUvWx", linkType: "SINGLE_USE" as const, expiresAt: new Date("2026-07-21T12:30:00Z"), active: true, createdAt: new Date("2026-07-20T12:00:00Z"), product: { id: "product", internalName: "Donation", titlePtBr: "Doação", titleEn: "Donation", price: "1234.56" }, currencyPair: { id: "pair", label: "BRL/USDT" } }],
};

describe("payment-link management surface", () => {
  it.each([
    ["en", en, "BRL 1,234.56", "Single use"],
    ["pt-BR", ptBR, "R$ 1.234,56", "Uso único"],
  ] as const)("renders localized generation, facts, and one-way revocation in %s", (locale, dictionary, price, linkType) => {
    const markup = renderToStaticMarkup(<PaymentLinkManagement data={populated} dictionary={dictionary} locale={locale} />);
    expect(markup).toContain('action="/admin/payment-links"');
    expect(markup).toContain('action="/admin/payment-links/link"');
    expect(markup).toContain('name="productId"');
    expect(markup).toContain('name="currencyPairId"');
    expect(markup).toContain('name="linkType"');
    expect(markup).toContain('name="expiresAt"');
    expect(markup).toContain("AbCdEfGhIjKlMnOpQrStUvWx");
    expect(markup).toContain(price);
    expect(markup).toContain(linkType);
    expect(markup).toContain(dictionary.adminPaymentLinkRevokeConfirm);
    expect(markup).not.toContain('href="');
  });

  it("replaces the form with a localized prerequisite recovery state", () => {
    const markup = renderToStaticMarkup(<PaymentLinkManagement data={{ links: [], activeProducts: [], activeCurrencyPairs: [] }} dictionary={en} locale="en" />);
    expect(markup).toContain("An active product and currency pair are required.");
    expect(markup).toContain("No payment links are available.");
    expect(markup).not.toContain('action="/admin/payment-links"');
  });
});

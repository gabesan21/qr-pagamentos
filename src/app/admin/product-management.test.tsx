import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";
import { formatProductPrice, ProductManagement } from "./product-management";

const product = {
  id: "00000000-0000-4000-8000-000000000001",
  internalName: "Annual support",
  titlePtBr: "Apoio anual",
  titleEn: "Annual support",
  descriptionPtBr: "Primeira linha\nSegunda linha",
  descriptionEn: "First line\nSecond line",
  price: "123456789012.123456",
  active: true,
  version: 7,
  createdAt: new Date("2026-07-20T12:00:00Z"),
  updatedAt: new Date("2026-07-20T12:00:00Z"),
};

describe("product management surface", () => {
  it.each([
    ["en", en, "BRL 123,456,789,012.123456", "First line\nSecond line"],
    ["pt-BR", ptBR, "R$ 123.456.789.012,123456", "Primeira linha\nSegunda linha"],
  ] as const)("renders exact populated CRUD fields and localized presentation in %s", (locale, dictionary, formattedPrice, description) => {
    const markup = renderToStaticMarkup(<ProductManagement dictionary={dictionary} locale={locale} products={[product]} />);

    expect(markup).toContain(formattedPrice);
    expect(markup).toContain(description);
    expect(markup.match(/data-slot="textarea"/g)).toHaveLength(4);
    expect(markup).toContain('action="/admin/products"');
    for (const name of ["internalName", "titlePtBr", "descriptionPtBr", "titleEn", "descriptionEn", "price", "id", "version", "active"]) {
      expect(markup).toContain(`name="${name}"`);
    }
    for (const action of ["create", "update", "active", "delete"]) expect(markup).toContain(`value="${action}"`);
    expect(markup).toContain(dictionary.adminProductDeleteConfirm);
    expect(markup).toContain('value="123456789012.123456"');
  });

  it("renders a localized empty state and formats without Number coercion", () => {
    const markup = renderToStaticMarkup(<ProductManagement dictionary={en} locale="en" products={[]} />);
    expect(markup).toContain("No products are available.");
    expect(formatProductPrice("999999999999.000001", "en")).toBe("BRL 999,999,999,999.000001");
    expect(formatProductPrice("999999999999.000001", "pt-BR")).toBe("R$ 999.999.999.999,000001");
  });
});

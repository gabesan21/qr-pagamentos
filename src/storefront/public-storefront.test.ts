import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPublicStorefrontService } from "./public-storefront";

const record = {
  storefrontDisplayNamePtBr: "Loja da Ana",
  storefrontDisplayNameEn: "Ana's store",
  storefrontAccentColor: "#106B5B",
  products: [
    {
      titlePtBr: "Café",
      titleEn: "Coffee",
      descriptionPtBr: "Café especial.",
      descriptionEn: "Specialty coffee.",
      price: "12.50",
      paymentLinks: [{ identifier: "AbCdEfGhIjKlMnOpQrStUvWx" }],
    },
    {
      titlePtBr: "Indisponível",
      titleEn: "Unavailable",
      descriptionPtBr: "Não deve aparecer.",
      descriptionEn: "Must not appear.",
      price: "9.00",
      paymentLinks: [],
    },
  ],
} as const;

describe("public storefront", () => {
  it("projects only localized public product facts and one eligible checkout identifier", async () => {
    const findEnabledBySlug = vi.fn().mockResolvedValue(record);
    const service = createPublicStorefrontService({ findEnabledBySlug }, () => new Date("2026-07-21T12:00:00Z"));

    await expect(service.read("ana-store", "en")).resolves.toEqual({
      displayName: "Ana's store",
      accentColor: "#106B5B",
      products: [{ title: "Coffee", description: "Specialty coffee.", price: "12.50", paymentLinkIdentifier: "AbCdEfGhIjKlMnOpQrStUvWx" }],
    });
    expect(findEnabledBySlug).toHaveBeenCalledWith("ana-store", new Date("2026-07-21T12:00:00Z"));
  });

  it("does not read storage for malformed or non-canonical storefront slugs", async () => {
    const findEnabledBySlug = vi.fn();
    const service = createPublicStorefrontService({ findEnabledBySlug });

    await expect(service.read("Ana Store", "pt-BR")).resolves.toBeNull();
    await expect(service.read("a".repeat(64), "pt-BR")).resolves.toBeNull();
    expect(findEnabledBySlug).not.toHaveBeenCalled();
  });

  it("keeps an enabled storefront with no eligible products available as an empty store", async () => {
    const findEnabledBySlug = vi.fn().mockResolvedValue({ ...record, products: [] });
    const service = createPublicStorefrontService({ findEnabledBySlug });

    await expect(service.read("ana-store", "pt-BR")).resolves.toEqual({
      displayName: "Loja da Ana",
      accentColor: "#106B5B",
      products: [],
    });
  });
});

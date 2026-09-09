import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DEFAULT_STOREFRONT_THEME_ID } from "@/design-system/themes";

import { createPublicCheckoutPresentationService } from "./public-checkout-presentation";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
const record = {
  product: { titlePtBr: "Doação", titleEn: "Donation", descriptionPtBr: "Apoie o projeto.", descriptionEn: "Support the project.", price: "12.50" },
  owner: {
    checkoutDataPolicy: "NAME_EMAIL_CPF" as const,
    storefrontDisplayNamePtBr: "Loja da Ana",
    storefrontDisplayNameEn: "Ana's Shop",
    storefrontAccentColor: "#125448",
    storefrontThemeId: "vault-blue",
    storefrontLogoMediaIdentifier: "logo-media-identifier",
  },
};

describe("public checkout presentation", () => {
  it("projects localized product facts, the closed checkout policy and the persisted branding", async () => {
    const findAvailableByIdentifier = vi.fn().mockResolvedValue(record);
    const service = createPublicCheckoutPresentationService({ findAvailableByIdentifier }, () => new Date("2026-07-21T12:00:00Z"));

    await expect(service.read(identifier, "en")).resolves.toEqual({
      product: { title: "Donation", description: "Support the project.", price: "12.50" },
      checkoutPolicy: "NAME_EMAIL_CPF",
      branding: { displayName: "Ana's Shop", accentColor: "#125448", themeId: "vault-blue", logoMediaIdentifier: "logo-media-identifier" },
    });
    expect(findAvailableByIdentifier).toHaveBeenCalledWith(identifier, new Date("2026-07-21T12:00:00Z"));
  });

  it("falls back to the design-system default theme when the owner never set one, independent of storefront_enabled", async () => {
    const bareOwnerRecord = {
      product: record.product,
      owner: {
        checkoutDataPolicy: "NONE" as const,
        storefrontDisplayNamePtBr: null,
        storefrontDisplayNameEn: null,
        storefrontAccentColor: null,
        storefrontThemeId: null,
        storefrontLogoMediaIdentifier: null,
      },
    };
    const findAvailableByIdentifier = vi.fn().mockResolvedValue(bareOwnerRecord);
    const service = createPublicCheckoutPresentationService({ findAvailableByIdentifier });

    const result = await service.read(identifier, "pt-BR");
    expect(result?.branding).toEqual({ displayName: null, accentColor: null, themeId: DEFAULT_STOREFRONT_THEME_ID, logoMediaIdentifier: null });
  });

  it("does not read storage for malformed identifiers", async () => {
    const findAvailableByIdentifier = vi.fn();
    const service = createPublicCheckoutPresentationService({ findAvailableByIdentifier });

    await expect(service.read("not-an-identifier", "pt-BR")).resolves.toBeNull();
    expect(findAvailableByIdentifier).not.toHaveBeenCalled();
  });
});

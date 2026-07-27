import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPublicCheckoutV2PresentationService, type PublicCheckoutV2PresentationRecord } from "./public-checkout-v2-presentation";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
const now = new Date("2026-07-26T15:00:00.000Z");

const productLinesRecord: PublicCheckoutV2PresentationRecord = {
  compositionKind: "PRODUCT_LINES",
  descriptionPtBr: null,
  descriptionEn: null,
  amount: null,
  currencyCode: "BRL",
  consumed: false,
  lines: [
    { quantity: 2, product: { titlePtBr: "Café expresso", titleEn: "Espresso shot", descriptionPtBr: "Extraído na hora", descriptionEn: "Freshly pulled", price: "12.5" } },
    { quantity: 1, product: { titlePtBr: "Café coado", titleEn: "Filter coffee", descriptionPtBr: "Coado devagar", descriptionEn: "Slow brewed", price: "9.9" } },
  ],
  owner: {
    checkoutDataPolicy: "NAME_EMAIL",
    storefrontDisplayNamePtBr: "Café da Ana",
    storefrontDisplayNameEn: "Ana's Coffee",
    storefrontAccentColor: "#125448",
    storefrontThemeId: "vault-blue",
    storefrontLogoMediaIdentifier: "logo-media-identifier",
  },
};

const fixedAmountRecord: PublicCheckoutV2PresentationRecord = {
  compositionKind: "FIXED_AMOUNT",
  descriptionPtBr: "Doação mensal",
  descriptionEn: "Monthly donation",
  amount: "10.50",
  currencyCode: null,
  consumed: false,
  lines: [],
  owner: {
    checkoutDataPolicy: "NONE",
    storefrontDisplayNamePtBr: null,
    storefrontDisplayNameEn: null,
    storefrontAccentColor: null,
    storefrontThemeId: null,
    storefrontLogoMediaIdentifier: null,
  },
};

function harness(record: PublicCheckoutV2PresentationRecord | null) {
  const findByIdentifier = vi.fn().mockResolvedValue(record);
  return { findByIdentifier, service: createPublicCheckoutV2PresentationService({ findByIdentifier }, () => now) };
}

describe("public checkout V2 presentation", () => {
  it("projects the localized product-lines composition with the seam-derived exact total and branding", async () => {
    const { service, findByIdentifier } = harness(productLinesRecord);

    await expect(service.read(identifier, "pt-BR")).resolves.toEqual({
      kind: "checkout",
      presentation: {
        composition: {
          kind: "PRODUCT_LINES",
          lines: [
            { product: { title: "Café expresso", description: "Extraído na hora", price: "12.5" }, quantity: 2 },
            { product: { title: "Café coado", description: "Coado devagar", price: "9.9" }, quantity: 1 },
          ],
          total: "34.9",
        },
        currencyCode: "BRL",
        checkoutPolicy: "NAME_EMAIL",
        branding: { displayName: "Café da Ana", accentColor: "#125448", themeId: "vault-blue", logoMediaIdentifier: "logo-media-identifier" },
      },
    });
    expect(findByIdentifier).toHaveBeenCalledWith(identifier, now);
  });

  it("localizes to English and resolves the fixed-amount composition with design-system branding defaults", async () => {
    const { service } = harness(fixedAmountRecord);

    await expect(service.read(identifier, "en")).resolves.toEqual({
      kind: "checkout",
      presentation: {
        composition: { kind: "FIXED_AMOUNT", description: "Monthly donation", amount: "10.50" },
        currencyCode: null,
        checkoutPolicy: "NONE",
        branding: { displayName: null, accentColor: null, themeId: "pix-paper", logoMediaIdentifier: null },
      },
    });
  });

  it("carries no owner identity, pair UUID, state, version, or timestamp fields", async () => {
    const { service } = harness(productLinesRecord);
    const outcome = await service.read(identifier, "pt-BR");

    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    for (const forbidden of ["owner", "ownerId", "currencyUuid", "exchangeCurrencyUuid", "currencyPairId", "identifier", "version", "state", "createdAt", "updatedAt", "expiresAt", "linkType", "singleUseSettlement", "consumed", "credential", "provider"]) {
      expect(outcome).not.toHaveProperty(forbidden);
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it.each([
    ["a missing link", null],
    ["a fixed amount without members", { ...fixedAmountRecord, amount: null }],
    ["a product-lines composition without lines", { ...productLinesRecord, lines: [] }],
  ])("maps %s to the one opaque null", async (_label, record) => {
    const { service } = harness(record);
    await expect(service.read(identifier, "pt-BR")).resolves.toBeNull();
  });

  it("rejects malformed identifiers before any store work", async () => {
    const { service, findByIdentifier } = harness(productLinesRecord);
    for (const candidate of ["short", 42, null, undefined]) {
      await expect(service.read(candidate, "pt-BR")).resolves.toBeNull();
    }
    expect(findByIdentifier).not.toHaveBeenCalled();
  });

  it("resolves a consumed single-use link to the paid view with the composition summary, total, and branding", async () => {
    const { service } = harness({ ...productLinesRecord, consumed: true });

    await expect(service.read(identifier, "pt-BR")).resolves.toEqual({
      kind: "paid",
      paid: {
        composition: {
          kind: "PRODUCT_LINES",
          lines: [
            { product: { title: "Café expresso", description: "Extraído na hora", price: "12.5" }, quantity: 2 },
            { product: { title: "Café coado", description: "Coado devagar", price: "9.9" }, quantity: 1 },
          ],
          total: "34.9",
        },
        currencyCode: "BRL",
        branding: { displayName: "Café da Ana", accentColor: "#125448", themeId: "vault-blue", logoMediaIdentifier: "logo-media-identifier" },
      },
    });
  });

  it("resolves a consumed fixed-amount link to the localized paid view", async () => {
    const { service } = harness({ ...fixedAmountRecord, consumed: true });

    await expect(service.read(identifier, "en")).resolves.toEqual({
      kind: "paid",
      paid: {
        composition: { kind: "FIXED_AMOUNT", description: "Monthly donation", amount: "10.50" },
        currencyCode: null,
        branding: { displayName: null, accentColor: null, themeId: "pix-paper", logoMediaIdentifier: null },
      },
    });
  });

  it("keys the paid branch only to the claim flag, never to live order state", async () => {
    // A later REFUNDED (or any order state change) is not even part of the
    // record: smuggling it in changes nothing and never leaks into the DTO.
    const smuggled = { ...productLinesRecord, consumed: true, orderState: "REFUNDED", claimedAt: "2026-07-26T14:00:00.000Z", orderV2Id: "8f6c2e0a-5f5e-4b1a-9c3d-7e2a1b4c6d8e" } as unknown as PublicCheckoutV2PresentationRecord;
    const { service } = harness(smuggled);
    const outcome = await service.read(identifier, "pt-BR");

    expect(outcome?.kind).toBe("paid");
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain("REFUNDED");
    expect(serialized).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    for (const forbidden of ["orderState", "claimedAt", "orderV2Id", "ownerId", "checkoutPolicy", "consumed", "singleUseSettlement", "settledAt", "capability", "attempt", "verifier", "retry", "provider", "currencyPairId", "currencyUuid", "exchangeCurrencyUuid", "version", "expiresAt", "linkType", "identifier"]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it("never maps an unclaimed record to the paid branch", async () => {
    const { service } = harness(productLinesRecord);
    const outcome = await service.read(identifier, "pt-BR");

    expect(outcome?.kind).toBe("checkout");
    expect(outcome).not.toHaveProperty("paid");
  });
});

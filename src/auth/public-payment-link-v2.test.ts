import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPublicPaymentLinkV2Service,
  createPublicPaymentLinkV2Store,
  type PublicPaymentLinkV2Record,
} from "./public-payment-link-v2";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
const currencyPair = {
  currencyUuid: "11111111-1111-1111-1111-111111111111",
  exchangeCurrencyUuid: "22222222-2222-4222-8222-222222222222",
};
const product = {
  titlePtBr: "Doação",
  titleEn: "Donation",
  descriptionPtBr: "Apoie o projeto.",
  descriptionEn: "Support the project.",
  price: "0.000001",
};

const linesRecord: PublicPaymentLinkV2Record = {
  compositionKind: "PRODUCT_LINES",
  descriptionPtBr: null,
  descriptionEn: null,
  amount: null,
  lines: [{ quantity: 3, product }],
  currencyPair,
};
const fixedRecord: PublicPaymentLinkV2Record = {
  compositionKind: "FIXED_AMOUNT",
  descriptionPtBr: "Doação livre",
  descriptionEn: "Open donation",
  amount: "10.25",
  lines: [],
  currencyPair,
};

function serviceWith(record: PublicPaymentLinkV2Record | null) {
  const findAvailableByIdentifier = vi.fn(async () => record);
  return {
    findAvailableByIdentifier,
    service: createPublicPaymentLinkV2Service({ findAvailableByIdentifier }, { now: () => new Date("2026-07-25T12:00:00.000Z") }),
  };
}

describe("public payment-link-v2 service", () => {
  it("returns null for malformed identifiers without touching the store", async () => {
    const { findAvailableByIdentifier, service } = serviceWith(linesRecord);
    for (const malformed of [null, undefined, 42, "", "short", `${identifier} `, identifier.toLowerCase().replace("a", "ã")]) {
      await expect(service.read(malformed, "en")).resolves.toBeNull();
    }
    expect(findAvailableByIdentifier).not.toHaveBeenCalled();
  });

  it("projects PRODUCT_LINES composition per locale with quantity and exact price, and nothing else", async () => {
    const { service } = serviceWith(linesRecord);

    await expect(service.read(identifier, "pt-BR")).resolves.toEqual({
      composition: {
        kind: "PRODUCT_LINES",
        lines: [{ product: { title: "Doação", description: "Apoie o projeto.", price: "0.000001" }, quantity: 3 }],
      },
      currencyPair,
    });
    await expect(service.read(identifier, "en")).resolves.toEqual({
      composition: {
        kind: "PRODUCT_LINES",
        lines: [{ product: { title: "Donation", description: "Support the project.", price: "0.000001" }, quantity: 3 }],
      },
      currencyPair,
    });
  });

  it("projects FIXED_AMOUNT composition per locale and fails closed on impossible null members", async () => {
    const { service } = serviceWith(fixedRecord);

    await expect(service.read(identifier, "pt-BR")).resolves.toEqual({
      composition: { kind: "FIXED_AMOUNT", description: "Doação livre", amount: "10.25" },
      currencyPair,
    });
    await expect(service.read(identifier, "en")).resolves.toEqual({
      composition: { kind: "FIXED_AMOUNT", description: "Open donation", amount: "10.25" },
      currencyPair,
    });

    const broken = serviceWith({ ...fixedRecord, amount: null });
    await expect(broken.service.read(identifier, "en")).resolves.toBeNull();
    const emptyLines = serviceWith({ ...linesRecord, lines: [] });
    await expect(emptyLines.service.read(identifier, "en")).resolves.toBeNull();
  });

  it("maps every unavailable record to null", async () => {
    const { service } = serviceWith(null);
    await expect(service.read(identifier, "en")).resolves.toBeNull();
  });

  it("carries no owner identity, state, version, timestamp, identifier, verifier, capability, or provider data", async () => {
    const { service } = serviceWith(linesRecord);
    const outcome = await service.read(identifier, "pt-BR");
    expect(outcome).not.toBeNull();

    const serialized = JSON.stringify(outcome);
    for (const forbidden of [
      "owner", "ownerId", "identifier", "id", "active", "state", "version", "createdAt", "updatedAt", "expiresAt",
      "linkType", "singleUse", "consumed", "settlement", "verifier", "capability", "retry", "provider", "credential",
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }

    expect(Object.keys(outcome ?? {}).sort()).toEqual(["composition", "currencyPair"]);
    const composition = outcome?.composition;
    if (composition?.kind === "PRODUCT_LINES") {
      expect(Object.keys(composition.lines[0] ?? {}).sort()).toEqual(["product", "quantity"]);
      expect(Object.keys(composition.lines[0]?.product ?? {}).sort()).toEqual(["description", "price", "title"]);
    }
  });
});

describe("public payment-link-v2 prisma store", () => {
  function fakeDatabase(link: unknown) {
    const findFirst = vi.fn(async (): Promise<unknown> => link);
    return { findFirst, database: { paymentLinkV2: { findFirst } } };
  }

  it("queries only active, unexpired-at-read-time links and hides inactive compositions", async () => {
    const activeLink = {
      compositionKind: "PRODUCT_LINES",
      descriptionPtBr: null,
      descriptionEn: null,
      amount: null,
      lines: [{ quantity: 1, product: { ...product, active: true } }],
      currencyPair,
    };
    const { findFirst, database } = fakeDatabase(activeLink);
    const store = createPublicPaymentLinkV2Store(database as never);
    const now = new Date("2026-07-25T12:00:00.000Z");

    await expect(store.findAvailableByIdentifier(identifier, now)).resolves.toMatchObject({ compositionKind: "PRODUCT_LINES" });
    expect(findFirst).toHaveBeenCalledWith({
      where: { identifier, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: expect.objectContaining({ compositionKind: true, currencyPair: expect.anything(), lines: expect.anything() }),
    });

    const inactiveProduct = fakeDatabase({ ...activeLink, lines: [{ quantity: 1, product: { ...product, active: false } }] });
    const inactiveStore = createPublicPaymentLinkV2Store(inactiveProduct.database as never);
    await expect(inactiveStore.findAvailableByIdentifier(identifier, now)).resolves.toBeNull();
  });

  it("never exposes the product active flag or identifiers in the record", async () => {
    const { database } = fakeDatabase({
      compositionKind: "PRODUCT_LINES",
      descriptionPtBr: null,
      descriptionEn: null,
      amount: null,
      lines: [{ quantity: 2, product: { ...product, active: true } }],
      currencyPair,
    });
    const store = createPublicPaymentLinkV2Store(database as never);

    await expect(store.findAvailableByIdentifier(identifier, new Date())).resolves.toEqual({
      compositionKind: "PRODUCT_LINES",
      descriptionPtBr: null,
      descriptionEn: null,
      amount: null,
      lines: [{ quantity: 2, product }],
      currencyPair,
    });
  });
});

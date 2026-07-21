import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({ getDatabaseClient: vi.fn() }));

import {
  createPublicPaymentLinkService,
  type PublicPaymentLinkRecord,
  type PublicPaymentLinkStore,
} from "./public-payment-link";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
const now = new Date("2026-07-20T12:00:00.000Z");
const record: PublicPaymentLinkRecord = {
  product: {
    titlePtBr: "Doação",
    titleEn: "Donation",
    descriptionPtBr: "Apoie o projeto.",
    descriptionEn: "Support the project.",
    price: "999999999999.999999",
  },
  currencyPair: {
    currencyUuid: "11111111-1111-1111-1111-111111111111",
    exchangeCurrencyUuid: "22222222-2222-2222-2222-222222222222",
  },
};

function store(result: PublicPaymentLinkRecord | null = record): PublicPaymentLinkStore & {
  findAvailableByIdentifier: ReturnType<typeof vi.fn>;
} {
  return { findAvailableByIdentifier: vi.fn().mockResolvedValue(result) };
}

describe("public payment-link service", () => {
  it("reads an exact valid identifier once and projects only the requested public locale", async () => {
    const availableStore = store();
    const service = createPublicPaymentLinkService(availableStore, { now: () => now });

    await expect(service.read(identifier, "pt-BR")).resolves.toEqual({
      product: { title: "Doação", description: "Apoie o projeto.", price: "999999999999.999999" },
      currencyPair: record.currencyPair,
    });
    await expect(service.read(identifier, "en")).resolves.toEqual({
      product: { title: "Donation", description: "Support the project.", price: "999999999999.999999" },
      currencyPair: record.currencyPair,
    });
    expect(availableStore.findAvailableByIdentifier).toHaveBeenNthCalledWith(1, identifier, now);
    expect(availableStore.findAvailableByIdentifier).toHaveBeenNthCalledWith(2, identifier, now);
  });

  it("returns exactly the redacted DTO while preserving maximum and fractional canonical prices", async () => {
    const service = createPublicPaymentLinkService(store({
      ...record,
      product: { ...record.product, price: "0.000001" },
      currencyPair: { ...record.currencyPair, providerLabel: "must not leak" } as PublicPaymentLinkRecord["currencyPair"],
    }));

    const result = await service.read(identifier, "en");

    expect(result).toEqual({
      product: { title: "Donation", description: "Support the project.", price: "0.000001" },
      currencyPair: record.currencyPair,
    });
    expect(Object.keys(result ?? {}).sort()).toEqual(["currencyPair", "product"]);
    expect(Object.keys(result?.product ?? {}).sort()).toEqual(["description", "price", "title"]);
    expect(Object.keys(result?.currencyPair ?? {}).sort()).toEqual(["currencyUuid", "exchangeCurrencyUuid"]);
  });

  it("collapses malformed spellings before lookup and every unavailable result to null", async () => {
    const malformedStore = store();
    const unavailableStore = store(null);
    const service = createPublicPaymentLinkService(malformedStore, { now: () => now });

    for (const malformed of ["", "short", ` ${identifier}`, `${identifier}=`, `${identifier}x`]) {
      await expect(service.read(malformed, "pt-BR")).resolves.toBeNull();
    }
    await expect(createPublicPaymentLinkService(unavailableStore, { now: () => now }).read(identifier, "en")).resolves.toBeNull();

    expect(malformedStore.findAvailableByIdentifier).not.toHaveBeenCalled();
    expect(unavailableStore.findAvailableByIdentifier).toHaveBeenCalledWith(identifier, now);
  });

  it("does not transform a valid identifier before lookup", async () => {
    const exactStore = store(null);
    const suppliedIdentifier = identifier.toLowerCase();

    await expect(createPublicPaymentLinkService(exactStore, { now: () => now }).read(suppliedIdentifier, "en")).resolves.toBeNull();

    expect(exactStore.findAvailableByIdentifier).toHaveBeenCalledWith(suppliedIdentifier, now);
  });

  it("passes an injected read time to the availability store for strict expiry evaluation", async () => {
    const expiredAtReadTime = store(null);
    const service = createPublicPaymentLinkService(expiredAtReadTime, { now: () => now });

    await expect(service.read(identifier, "pt-BR")).resolves.toBeNull();
    expect(expiredAtReadTime.findAvailableByIdentifier).toHaveBeenCalledWith(identifier, now);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../db/client", () => ({ getDatabaseClient: vi.fn() }));

import { getDatabaseClient } from "../db/client";
import { findPaymentLinkV2CurrencyCode, listActivePaymentLinkCurrencyPairs } from "./payment-link-v2-catalog";

const getDatabaseClientMock = vi.mocked(getDatabaseClient);

// The pointer table holds one row per ISO code, and every pair sharing a
// `currencyUuid` must resolve that code even when the pointer is attached to a
// different (default) pair of the same currency.
function fakeDb() {
  return {
    catalogCurrencyPair: { findMany: vi.fn<() => Promise<unknown>>() },
    supportedExchangeCurrency: {
      findMany: vi.fn<() => Promise<unknown>>(),
      findFirst: vi.fn<() => Promise<unknown>>(),
    },
    paymentLinkV2: { findFirst: vi.fn<() => Promise<unknown>>() },
  };
}

describe("listActivePaymentLinkCurrencyPairs — currency-code projection", () => {
  it("resolves the pointer's code for every pair sharing the currency, default or not", async () => {
    const db = fakeDb();
    db.catalogCurrencyPair.findMany.mockResolvedValue([
      { id: "pair-default", label: "PIX/BRL", currencyUuid: "cur-brl" },
      { id: "pair-secondary", label: "Card/BRL", currencyUuid: "cur-brl" },
    ]);
    db.supportedExchangeCurrency.findMany.mockResolvedValue([{ code: "BRL", pair: { currencyUuid: "cur-brl" } }]);
    getDatabaseClientMock.mockReturnValue(db as never);

    await expect(listActivePaymentLinkCurrencyPairs()).resolves.toEqual([
      { id: "pair-default", label: "PIX/BRL", currencyCode: "BRL" },
      { id: "pair-secondary", label: "Card/BRL", currencyCode: "BRL" },
    ]);
  });

  it("resolves a non-BRL pointer code", async () => {
    const db = fakeDb();
    db.catalogCurrencyPair.findMany.mockResolvedValue([{ id: "pair-usd", label: "Card/USD", currencyUuid: "cur-usd" }]);
    db.supportedExchangeCurrency.findMany.mockResolvedValue([{ code: "USD", pair: { currencyUuid: "cur-usd" } }]);
    getDatabaseClientMock.mockReturnValue(db as never);

    await expect(listActivePaymentLinkCurrencyPairs()).resolves.toEqual([
      { id: "pair-usd", label: "Card/USD", currencyCode: "USD" },
    ]);
  });

  it("resolves null for a pair whose currency has no pointer", async () => {
    const db = fakeDb();
    db.catalogCurrencyPair.findMany.mockResolvedValue([{ id: "pair-orphan", label: "Orphan", currencyUuid: "cur-orphan" }]);
    db.supportedExchangeCurrency.findMany.mockResolvedValue([]);
    getDatabaseClientMock.mockReturnValue(db as never);

    await expect(listActivePaymentLinkCurrencyPairs()).resolves.toEqual([
      { id: "pair-orphan", label: "Orphan", currencyCode: null },
    ]);
  });
});

describe("findPaymentLinkV2CurrencyCode — owner-scoped identity lookup", () => {
  it("stays owner-scoped and resolves null when the link is not found", async () => {
    const db = fakeDb();
    db.paymentLinkV2.findFirst.mockResolvedValue(null);
    getDatabaseClientMock.mockReturnValue(db as never);

    await expect(findPaymentLinkV2CurrencyCode("owner-1", "link-1")).resolves.toBeNull();
    expect(db.paymentLinkV2.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "link-1", ownerId: "owner-1" } }),
    );
    expect(db.supportedExchangeCurrency.findFirst).not.toHaveBeenCalled();
  });

  it("resolves the code through the currency identity, pairing secondary pairs with the shared pointer", async () => {
    const db = fakeDb();
    // The link is bound to a secondary pair of the currency; the pointer lives
    // on the other pair, so only the identity match can resolve the code.
    db.paymentLinkV2.findFirst.mockResolvedValue({ currencyPair: { currencyUuid: "cur-brl" } });
    db.supportedExchangeCurrency.findFirst.mockResolvedValue({ code: "BRL" });
    getDatabaseClientMock.mockReturnValue(db as never);

    await expect(findPaymentLinkV2CurrencyCode("owner-1", "link-2")).resolves.toBe("BRL");
    expect(db.supportedExchangeCurrency.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pair: { currencyUuid: "cur-brl" } } }),
    );
  });

  it("resolves null when the link's currency has no pointer", async () => {
    const db = fakeDb();
    db.paymentLinkV2.findFirst.mockResolvedValue({ currencyPair: { currencyUuid: "cur-orphan" } });
    db.supportedExchangeCurrency.findFirst.mockResolvedValue(null);
    getDatabaseClientMock.mockReturnValue(db as never);

    await expect(findPaymentLinkV2CurrencyCode("owner-1", "link-3")).resolves.toBeNull();
  });
});

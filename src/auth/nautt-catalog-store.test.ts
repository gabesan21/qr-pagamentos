import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createDatabaseNauttCatalogStore, NauttCatalogDefaultMethodError, NauttCatalogExchangeCurrencyConflictError } from "./nautt-catalog";

function database() {
  const transaction = {
    catalogCurrencyPair: {
      create: vi.fn(async () => ({ id: randomUUID() })),
      findFirst: vi.fn<() => Promise<unknown>>(),
      findUnique: vi.fn<() => Promise<unknown>>(),
      update: vi.fn(async () => ({ id: randomUUID(), active: true })),
    },
    supportedExchangeCurrency: {
      findFirst: vi.fn<() => Promise<unknown>>(),
      findUnique: vi.fn<() => Promise<unknown>>(),
      update: vi.fn(async () => ({})),
    },
  };
  return {
    transaction,
    db: {
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => unknown, options: unknown) => {
        expect(options).toEqual({ isolationLevel: "Serializable" });
        return operation(transaction);
      }),
      catalogCurrencyPair: { findMany: vi.fn(async () => []) },
      supportedExchangeCurrency: { findMany: vi.fn(async () => []) },
    },
  };
}

describe("database Nautt catalog writers", () => {
  it("serializes a new method and refuses an exchange ID assigned to another currency", async () => {
    const { db, transaction } = database();
    const currencyUuid = randomUUID();
    transaction.supportedExchangeCurrency.findUnique.mockResolvedValue({ pair: { currencyUuid } });
    transaction.catalogCurrencyPair.findFirst.mockResolvedValue({ id: randomUUID() });
    const store = createDatabaseNauttCatalogStore(db as never);

    await expect(store.createCurrencyMethod({ label: "PIX", currencyCode: "BRL", exchangeCurrencyUuid: randomUUID() }))
      .rejects.toBeInstanceOf(NauttCatalogExchangeCurrencyConflictError);
    expect(transaction.catalogCurrencyPair.create).not.toHaveBeenCalled();
  });

  it("moves the default pointer only to an active method in the same currency", async () => {
    const { db, transaction } = database();
    const currencyUuid = randomUUID();
    transaction.supportedExchangeCurrency.findUnique.mockResolvedValue({ pair: { currencyUuid } });
    transaction.catalogCurrencyPair.findUnique.mockResolvedValue({ active: true, currencyUuid });
    const store = createDatabaseNauttCatalogStore(db as never);

    await store.setDefaultCurrencyMethod("BRL", randomUUID());
    expect(transaction.supportedExchangeCurrency.update).toHaveBeenCalledWith(expect.objectContaining({ data: { pairId: expect.any(String) } }));
  });

  it("refuses inactive and cross-currency default candidates", async () => {
    const { db, transaction } = database();
    const currencyUuid = randomUUID();
    transaction.supportedExchangeCurrency.findUnique.mockResolvedValue({ pair: { currencyUuid } });
    transaction.catalogCurrencyPair.findUnique.mockResolvedValueOnce({ active: false, currencyUuid });
    const store = createDatabaseNauttCatalogStore(db as never);

    await expect(store.setDefaultCurrencyMethod("BRL", randomUUID())).rejects.toBeInstanceOf(NauttCatalogDefaultMethodError);
    transaction.catalogCurrencyPair.findUnique.mockResolvedValueOnce({ active: true, currencyUuid: randomUUID() });
    await expect(store.setDefaultCurrencyMethod("BRL", randomUUID())).rejects.toBeInstanceOf(NauttCatalogDefaultMethodError);
    expect(transaction.supportedExchangeCurrency.update).not.toHaveBeenCalled();
  });

  it("refuses default deactivation inside the same serializable writer", async () => {
    const { db, transaction } = database();
    transaction.supportedExchangeCurrency.findFirst.mockResolvedValue({ code: "BRL" });
    const store = createDatabaseNauttCatalogStore(db as never);

    await expect(store.setCurrencyPairActive(randomUUID(), false)).rejects.toBeInstanceOf(NauttCatalogDefaultMethodError);
    expect(transaction.catalogCurrencyPair.update).not.toHaveBeenCalled();
  });
});

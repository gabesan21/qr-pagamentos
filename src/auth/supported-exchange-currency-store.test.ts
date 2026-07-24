import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createDatabaseSupportedExchangeCurrencyStore } from "./supported-exchange-currency";

function fakeDatabase() {
  const transaction = {
    catalogCurrencyPair: {
      findUnique: vi.fn(async (): Promise<unknown> => null),
      create: vi.fn(async (): Promise<unknown> => ({ id: randomUUID() })),
    },
    supportedExchangeCurrency: {
      findUnique: vi.fn(async (): Promise<unknown> => null),
      create: vi.fn(async (): Promise<unknown> => ({})),
      upsert: vi.fn(async (): Promise<unknown> => ({})),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (transaction: unknown) => unknown, options: unknown) => {
      expect(options).toEqual({ isolationLevel: "Serializable" });
      return operation(transaction);
    }),
    supportedExchangeCurrency: {
      findMany: vi.fn(async (): Promise<unknown[]> => []),
      findUnique: vi.fn(async (): Promise<unknown> => null),
      deleteMany: vi.fn(async (): Promise<unknown> => ({ count: 0 })),
    },
  };
  return { database, transaction };
}

const values = () => ({
  code: "BRL",
  label: "BRL/USDT",
  currencyUuid: randomUUID(),
  exchangeCurrencyUuid: randomUUID(),
});

describe("database supported exchange currency store", () => {
  it("serializes registration and returns the typed pair-exists outcome without inserting", async () => {
    const { database, transaction } = fakeDatabase();
    transaction.catalogCurrencyPair.findUnique.mockResolvedValueOnce({ id: "retained" });
    const store = createDatabaseSupportedExchangeCurrencyStore(database as never);

    await expect(store.register(values())).resolves.toBe("pair-exists");
    expect(transaction.catalogCurrencyPair.create).not.toHaveBeenCalled();
    expect(transaction.supportedExchangeCurrency.create).not.toHaveBeenCalled();
  });

  it("returns the typed code-active outcome when the pointer already exists", async () => {
    const { database, transaction } = fakeDatabase();
    transaction.supportedExchangeCurrency.findUnique.mockResolvedValueOnce({ code: "BRL" });
    const store = createDatabaseSupportedExchangeCurrencyStore(database as never);

    await expect(store.register(values())).resolves.toBe("code-active");
    expect(transaction.catalogCurrencyPair.create).not.toHaveBeenCalled();
  });

  it("inserts the pair and the pointer in one serializing transaction", async () => {
    const { database, transaction } = fakeDatabase();
    const pairId = randomUUID();
    transaction.catalogCurrencyPair.create.mockResolvedValueOnce({ id: pairId });
    const store = createDatabaseSupportedExchangeCurrencyStore(database as never);
    const input = values();

    await expect(store.register(input)).resolves.toBe("registered");
    expect(transaction.catalogCurrencyPair.create).toHaveBeenCalledWith({
      data: { label: input.label, currencyUuid: input.currencyUuid, exchangeCurrencyUuid: input.exchangeCurrencyUuid },
      select: { id: true },
    });
    expect(transaction.supportedExchangeCurrency.create).toHaveBeenCalledWith({ data: { code: input.code, pairId } });
    const order = vi.mocked(database.$transaction).mock.invocationCallOrder[0];
    expect(vi.mocked(transaction.catalogCurrencyPair.create).mock.invocationCallOrder[0]).toBeGreaterThan(order);
    expect(vi.mocked(transaction.supportedExchangeCurrency.create).mock.invocationCallOrder[0])
      .toBeGreaterThan(vi.mocked(transaction.catalogCurrencyPair.create).mock.invocationCallOrder[0]);
  });

  it("maps a concurrent registration conflict to the typed pair-exists outcome instead of leaking", async () => {
    const { database } = fakeDatabase();
    vi.mocked(database.$transaction).mockRejectedValueOnce({ code: "P2002" });
    const store = createDatabaseSupportedExchangeCurrencyStore(database as never);

    await expect(store.register(values())).resolves.toBe("pair-exists");
  });

  it("re-points the pointer to the retained pair row on replace", async () => {
    const { database, transaction } = fakeDatabase();
    transaction.catalogCurrencyPair.findUnique.mockResolvedValueOnce({ id: "retained" });
    const store = createDatabaseSupportedExchangeCurrencyStore(database as never);
    const input = values();

    await expect(store.replace(input)).resolves.toBe("repointed");
    expect(transaction.catalogCurrencyPair.create).not.toHaveBeenCalled();
    expect(transaction.supportedExchangeCurrency.upsert).toHaveBeenCalledWith({
      where: { code: input.code },
      create: { code: input.code, pairId: "retained" },
      update: { pairId: "retained" },
    });
  });

  it("inserts a new pair row and moves the pointer atomically on replacement", async () => {
    const { database, transaction } = fakeDatabase();
    const pairId = randomUUID();
    transaction.catalogCurrencyPair.create.mockResolvedValueOnce({ id: pairId });
    const store = createDatabaseSupportedExchangeCurrencyStore(database as never);
    const input = values();

    await expect(store.replace(input)).resolves.toBe("inserted");
    expect(transaction.supportedExchangeCurrency.upsert).toHaveBeenCalledWith({
      where: { code: input.code },
      create: { code: input.code, pairId },
      update: { pairId },
    });
  });

  it("retries a replace once against the retained row after a serialization conflict", async () => {
    const { database, transaction } = fakeDatabase();
    vi.mocked(database.$transaction)
      .mockRejectedValueOnce({ code: "40001" })
      .mockImplementationOnce(async (operation: (transaction: unknown) => unknown, options: unknown) => {
        expect(options).toEqual({ isolationLevel: "Serializable" });
        transaction.catalogCurrencyPair.findUnique.mockResolvedValueOnce({ id: "winner" });
        return operation(transaction);
      });
    const store = createDatabaseSupportedExchangeCurrencyStore(database as never);

    await expect(store.replace(values())).resolves.toBe("repointed");
    expect(vi.mocked(database.$transaction)).toHaveBeenCalledTimes(2);
    expect(transaction.supportedExchangeCurrency.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { pairId: "winner" } }),
    );
  });

  it("deactivates by removing only the pointer row", async () => {
    const { database } = fakeDatabase();
    const store = createDatabaseSupportedExchangeCurrencyStore(database as never);

    await store.deactivate("BRL");
    expect(database.supportedExchangeCurrency.deleteMany).toHaveBeenCalledWith({ where: { code: "BRL" } });
  });

  it("reads active choices ordered by code and resolves the full pair by code", async () => {
    const { database } = fakeDatabase();
    database.supportedExchangeCurrency.findMany.mockResolvedValueOnce([
      { code: "BRL", pair: { label: "BRL/USDT" } },
    ]);
    database.supportedExchangeCurrency.findUnique.mockResolvedValueOnce({
      code: "BRL",
      pair: { label: "BRL/USDT", currencyUuid: "currency-uuid", exchangeCurrencyUuid: "exchange-uuid" },
    });
    const store = createDatabaseSupportedExchangeCurrencyStore(database as never);

    await expect(store.listActive()).resolves.toEqual([{ code: "BRL", label: "BRL/USDT" }]);
    expect(database.supportedExchangeCurrency.findMany).toHaveBeenCalledWith({
      orderBy: { code: "asc" },
      select: { code: true, pair: { select: { label: true } } },
    });
    await expect(store.findActivePair("BRL")).resolves.toEqual({
      code: "BRL",
      label: "BRL/USDT",
      currencyUuid: "currency-uuid",
      exchangeCurrencyUuid: "exchange-uuid",
    });
    await expect(store.findActivePair("COP")).resolves.toBeNull();
  });
});

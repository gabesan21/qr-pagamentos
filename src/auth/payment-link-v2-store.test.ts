import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { createPaymentLinkV2Store } from "./payment-link-v2";

const ownerId = randomUUID();
const linkId = randomUUID();
const pairId = randomUUID();
const productId = randomUUID();
const now = new Date("2026-07-25T12:00:00.000Z");

function fakeDatabase() {
  const transaction = {
    $queryRaw: vi.fn(async (_strings: readonly string[], ..._values: unknown[]): Promise<unknown[]> => [{ id: randomUUID() }]),
    paymentLinkV2: {
      create: vi.fn(async (): Promise<unknown> => ({})),
      updateMany: vi.fn(async (): Promise<unknown> => ({ count: 1 })),
      findFirst: vi.fn(async (): Promise<unknown> => null),
    },
    paymentLinkV2Line: {
      createMany: vi.fn(async (): Promise<unknown> => ({})),
      deleteMany: vi.fn(async (): Promise<unknown> => ({ count: 0 })),
    },
  };
  const database = {
    $transaction: vi.fn(async (operation: (transaction: unknown) => unknown) => operation(transaction)),
    paymentLink: { count: vi.fn(async (): Promise<number> => 0) },
    paymentLinkV2: {
      count: vi.fn(async (): Promise<number> => 0),
      updateMany: transaction.paymentLinkV2.updateMany,
      findFirst: transaction.paymentLinkV2.findFirst,
    },
    checkoutAttemptV2: { count: vi.fn(async (): Promise<number> => 0) },
  };
  return { database, transaction };
}

const createValues = () => ({
  id: linkId,
  identifier: "a".repeat(24),
  compositionKind: "PRODUCT_LINES" as const,
  descriptionPtBr: null,
  descriptionEn: null,
  amount: null,
  currencyPairId: pairId,
  linkType: "REUSABLE" as const,
  expiresAt: null,
  lines: [{ productId, position: 1, quantity: 2 }],
  createdAt: now,
  updatedAt: now,
});

describe("payment-link-v2 prisma store", () => {
  it("verifies the active pair and products under shared row locks inside one transaction before inserting", async () => {
    const { database, transaction } = fakeDatabase();
    const store = createPaymentLinkV2Store(database as never);

    await store.create(ownerId, createValues());
    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    const rawCalls = transaction.$queryRaw.mock.calls.map((call) => call[0].join("?"));
    expect(rawCalls[0]).toContain('"app"."catalog_currency_pair"');
    expect(rawCalls[0]).toContain("FOR SHARE");
    expect(rawCalls[1]).toContain('"app"."product"');
    expect(rawCalls[1]).toContain("FOR SHARE");
    expect(transaction.paymentLinkV2.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: linkId, ownerId, active: true, version: 0, createdAt: now, updatedAt: now }),
    });
    expect(transaction.paymentLinkV2Line.createMany).toHaveBeenCalledWith({
      data: [{ paymentLinkV2Id: linkId, ownerId, productId, position: 1, quantity: 2 }],
    });
  });

  it("returns dependency-unavailable without inserting when a product is inactive or cross-owner", async () => {
    const { database, transaction } = fakeDatabase();
    transaction.$queryRaw.mockImplementation(async (strings: readonly string[]) => {
      const sql = strings.join("?");
      return sql.includes('"app"."product"') ? [] : [{ id: randomUUID() }];
    });
    const store = createPaymentLinkV2Store(database as never);

    await expect(store.create(ownerId, createValues())).resolves.toBe("dependency-unavailable");
    expect(transaction.paymentLinkV2.create).not.toHaveBeenCalled();
    expect(transaction.paymentLinkV2Line.createMany).not.toHaveBeenCalled();
  });

  it("probes both identifier tables for the shared namespace", async () => {
    const { database } = fakeDatabase();
    database.paymentLink.count.mockResolvedValueOnce(1);
    const store = createPaymentLinkV2Store(database as never);

    await expect(store.identifierTaken("b".repeat(24))).resolves.toBe(true);
    expect(database.paymentLink.count).toHaveBeenCalledWith({ where: { identifier: "b".repeat(24) } });
    expect(database.paymentLinkV2.count).toHaveBeenCalledWith({ where: { identifier: "b".repeat(24) } });
  });

  it("applies the financial edit through expected-version CAS and replaces lines atomically", async () => {
    const { database, transaction } = fakeDatabase();
    const store = createPaymentLinkV2Store(database as never);

    await store.edit(ownerId, linkId, 3, {
      expiresAt: null,
      updatedAt: now,
      financial: { descriptionPtBr: null, descriptionEn: null, amount: null, lines: [{ productId, position: 1, quantity: 9 }] },
    });
    expect(transaction.paymentLinkV2.updateMany).toHaveBeenCalledWith({
      where: { id: linkId, ownerId, version: 3 },
      data: expect.objectContaining({ version: { increment: 1 }, updatedAt: now, descriptionPtBr: null, amount: null }),
    });
    expect(transaction.paymentLinkV2Line.deleteMany).toHaveBeenCalledWith({ where: { paymentLinkV2Id: linkId, ownerId } });
    expect(transaction.paymentLinkV2Line.createMany).toHaveBeenCalledWith({
      data: [{ paymentLinkV2Id: linkId, ownerId, productId, position: 1, quantity: 9 }],
    });
  });

  it("never re-checks the immutable pair on edit and loses the CAS without touching lines", async () => {
    const { database, transaction } = fakeDatabase();
    transaction.paymentLinkV2.updateMany.mockResolvedValueOnce({ count: 0 });
    const store = createPaymentLinkV2Store(database as never);

    await expect(store.edit(ownerId, linkId, 3, { expiresAt: null, updatedAt: now, financial: null })).resolves.toBeNull();
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.paymentLinkV2Line.deleteMany).not.toHaveBeenCalled();
  });

  it("toggles active through expected-version CAS and observes real checkout_attempt_v2 existence", async () => {
    const { database } = fakeDatabase();
    const store = createPaymentLinkV2Store(database as never);

    await store.setActive(ownerId, linkId, 0, false, now);
    expect(database.paymentLinkV2.updateMany).toHaveBeenCalledWith({
      where: { id: linkId, ownerId, version: 0 },
      data: { active: false, version: { increment: 1 }, updatedAt: now },
    });
    database.paymentLinkV2.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(store.setActive(ownerId, linkId, 0, false, now)).resolves.toBeNull();
    await expect(store.hasCheckoutAttempt(linkId)).resolves.toBe(false);
    expect(database.checkoutAttemptV2.count).toHaveBeenCalledWith({ where: { paymentLinkV2Id: linkId } });
    database.checkoutAttemptV2.count.mockResolvedValueOnce(1);
    await expect(store.hasCheckoutAttempt(linkId)).resolves.toBe(true);
  });
});

import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PrismaClient } from "../../generated/prisma/client";

import { createPrismaProviderOrderStore } from "./provider-order-store";

const ownerId = "110e8400-e29b-41d4-a716-446655440011";
const otherOwnerId = "220e8400-e29b-41d4-a716-446655440022";
const quoteUuid = "330e8400-e29b-41d4-a716-446655440033";
const now = new Date("2026-07-18T20:00:00.000Z");

function durablePrismaFake(): PrismaClient & {
  __seedOrderV2: (row: { id: string; ownerId: string; currencyUuid: string; exchangeCurrencyUuid: string }) => void;
  __seedPair: (row: { id: string; currencyUuid: string; exchangeCurrencyUuid: string }) => void;
  __verificationRow: (ownerId: string, pairId: string) => Record<string, unknown> | undefined;
} {
  const quotes = new Map<string, { quoteUuid: string; ownerId: string; expiresAt: Date; claimedAt: Date | null }>();
  const orders = new Map<string, Record<string, unknown>>();
  const providerQuote = {
    async create({ data }: { data: { quoteUuid: string; ownerId: string; expiresAt: Date } }) {
      if (quotes.has(data.quoteUuid)) throw new Error("unique");
      const stored = { ...data, claimedAt: null };
      quotes.set(data.quoteUuid, stored);
      return stored;
    },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: { claimedAt: Date | null } }) {
      const quote = quotes.get(where.quoteUuid as string);
      const orderExists = [...orders.values()].some((order) => order.quoteUuid === where.quoteUuid);
      if (!quote || quote.ownerId !== where.ownerId || quote.claimedAt !== null || quote.expiresAt <= (where.expiresAt as { gt: Date }).gt || orderExists) return { count: 0 };
      quote.claimedAt = data.claimedAt;
      return { count: 1 };
    },
  };
  const providerOrder = {
    async create({ data }: { data: { quoteUuid: string; ownerId: string } }) {
      const stored = { id: randomUUID(), ...data, creationState: "CREATING", providerOrderUuid: null, status: null, reconciliationVersion: 0 };
      orders.set(stored.id, stored);
      return stored;
    },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      const row = orders.get(where.id as string);
      if (
        !row ||
        row.ownerId !== where.ownerId ||
        (where.providerOrderUuid !== undefined && row.providerOrderUuid !== where.providerOrderUuid) ||
        (where.creationState !== undefined && row.creationState !== where.creationState) ||
        (where.status !== undefined && row.status !== where.status) ||
        (where.reconciliationVersion !== undefined && row.reconciliationVersion !== where.reconciliationVersion)
      ) {
        return { count: 0 };
      }
      const { reconciliationVersion, ...rest } = data;
      const nextVersion =
        reconciliationVersion && typeof reconciliationVersion === "object" && "increment" in (reconciliationVersion as Record<string, unknown>)
          ? (row.reconciliationVersion as number) + (reconciliationVersion as { increment: number }).increment
          : (row.reconciliationVersion as number);
      orders.set(row.id as string, { ...row, ...rest, reconciliationVersion: nextVersion });
      return { count: 1 };
    },
    async findUniqueOrThrow({ where }: { where: { id: string } }) {
      const row = orders.get(where.id);
      if (!row) throw new Error("provider order not found");
      return row;
    },
    async deleteMany({ where }: { where: Record<string, unknown> }) {
      const row = orders.get(where.id as string);
      if (
        !row ||
        row.ownerId !== where.ownerId ||
        row.quoteUuid !== where.quoteUuid ||
        (where.creationState !== undefined && row.creationState !== where.creationState)
      ) {
        return { count: 0 };
      }
      orders.delete(where.id as string);
      return { count: 1 };
    },
  };
  const orderV2Rows = new Map<string, { id: string; ownerId: string; currencyUuid: string; exchangeCurrencyUuid: string }>();
  const pairRows = new Map<string, { id: string; currencyUuid: string; exchangeCurrencyUuid: string }>();
  const verificationRows = new Map<string, Record<string, unknown>>();
  const orderV2 = {
    async findFirst({ where }: { where: { id: string; ownerId: string } }) {
      const row = orderV2Rows.get(where.id);
      return row && row.ownerId === where.ownerId ? row : null;
    },
  };
  const catalogCurrencyPair = {
    async findUnique({ where }: { where: { currencyUuid_exchangeCurrencyUuid: { currencyUuid: string; exchangeCurrencyUuid: string } } }) {
      const key = `${where.currencyUuid_exchangeCurrencyUuid.currencyUuid}:${where.currencyUuid_exchangeCurrencyUuid.exchangeCurrencyUuid}`;
      return [...pairRows.values()].find((pair) => `${pair.currencyUuid}:${pair.exchangeCurrencyUuid}` === key) ?? null;
    },
  };
  const currencyPairVerification = {
    async upsert({ where, create, update }: { where: { ownerId_pairId: { ownerId: string; pairId: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) {
      const key = `${where.ownerId_pairId.ownerId}:${where.ownerId_pairId.pairId}`;
      const next = verificationRows.has(key) ? { ...verificationRows.get(key), ...update } : { ...create };
      verificationRows.set(key, next);
      return next;
    },
  };
  const prisma = {
    providerQuote,
    providerOrder,
    orderV2,
    catalogCurrencyPair,
    currencyPairVerification,
    async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
      return callback({ providerQuote, providerOrder, orderV2, catalogCurrencyPair, currencyPairVerification });
    },
    __seedOrderV2(row: { id: string; ownerId: string; currencyUuid: string; exchangeCurrencyUuid: string }) {
      orderV2Rows.set(row.id, row);
    },
    __seedPair(row: { id: string; currencyUuid: string; exchangeCurrencyUuid: string }) {
      pairRows.set(row.id, row);
    },
    __verificationRow(ownerId: string, pairId: string) {
      return verificationRows.get(`${ownerId}:${pairId}`);
    },
  };
  return prisma as unknown as PrismaClient & {
    __seedOrderV2: (row: { id: string; ownerId: string; currencyUuid: string; exchangeCurrencyUuid: string }) => void;
    __seedPair: (row: { id: string; currencyUuid: string; exchangeCurrencyUuid: string }) => void;
    __verificationRow: (ownerId: string, pairId: string) => Record<string, unknown> | undefined;
  };
}

describe("Prisma provider order store", () => {
  it("survives service reconstruction and atomically permits one owner claim", async () => {
    const prisma = durablePrismaFake();
    const issuer = createPrismaProviderOrderStore(prisma);
    const reconstructed = createPrismaProviderOrderStore(prisma);
    await expect(issuer.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-18T20:05:00.000Z") })).resolves.toBe(true);

    const [first, second] = await Promise.all([
      reconstructed.claimForCreation({ quoteUuid, ownerId, now }),
      reconstructed.claimForCreation({ quoteUuid, ownerId, now }),
    ]);

    expect([first.kind, second.kind].sort()).toEqual(["claimed", "unavailable"]);
  });

  it("keeps cross-owner and expired misses opaque without consuming the quote", async () => {
    const store = createPrismaProviderOrderStore(durablePrismaFake());
    await store.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-18T20:05:00.000Z") });

    await expect(store.claimForCreation({ quoteUuid, ownerId: otherOwnerId, now })).resolves.toEqual({ kind: "unavailable" });
    await expect(store.claimForCreation({ quoteUuid, ownerId, now })).resolves.toMatchObject({ kind: "claimed" });
  });

  it("persists the additive V2 attach identity on claim", async () => {
    const prisma = durablePrismaFake();
    const orderV2Id = "440e8400-e29b-41d4-a716-446655440044";
    const providerOrder = (prisma as unknown as { providerOrder: { create: (input: unknown) => Promise<unknown> } }).providerOrder;
    const createSpy = vi.spyOn(providerOrder, "create");
    const store = createPrismaProviderOrderStore(prisma);
    await store.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-18T20:05:00.000Z") });

    await expect(store.claimForCreation({ quoteUuid, ownerId, now, orderV2Id })).resolves.toMatchObject({ kind: "claimed" });

    expect(createSpy).toHaveBeenCalledWith({ data: expect.objectContaining({ orderV2Id }) });
  });

  it("reconcile omits PIX keys from the write when the authoritative read carries none, and the row keeps its stored payload", async () => {
    const prisma = durablePrismaFake();
    const store = createPrismaProviderOrderStore(prisma);
    const providerOrderInternal = (prisma as unknown as { providerOrder: { updateMany: (input: unknown) => Promise<{ count: number }>; findUniqueOrThrow: (input: unknown) => Promise<Record<string, unknown>> } }).providerOrder;
    const providerOrderUuid = "440e8400-e29b-41d4-a716-446655440044";

    await store.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-18T20:05:00.000Z") });
    const claim = await store.claimForCreation({ quoteUuid, ownerId, now });
    if (claim.kind !== "claimed") throw new Error("expected claim to succeed");

    await providerOrderInternal.updateMany({
      where: { id: claim.attempt.id, ownerId, quoteUuid, creationState: "CREATING" },
      data: {
        creationState: "CREATED",
        providerOrderUuid,
        status: "new",
        fiatAmount: "1000.0000",
        cryptoAmount: "196.0784",
        nauttQuote: "5.1000",
        providerExpiresAt: new Date("2026-07-18T22:00:00.000Z"),
        paymentMethod: "pix",
        pixCopyPaste: "existing-pix-code",
        pixQrcodeUrl: "https://example.com/qr.png",
        reconciliationVersion: { increment: 1 },
      },
    });
    const observed = await providerOrderInternal.findUniqueOrThrow({ where: { id: claim.attempt.id } });

    const updateManySpy = vi.spyOn(providerOrderInternal, "updateMany");
    const reconciled = await store.reconcile(observed as never, {
      orderUuid: providerOrderUuid,
      status: "processing",
      fiatAmount: "1000.0000",
      cryptoAmount: "196.0784",
      nauttQuote: "5.1000",
      expiresAt: new Date("2026-07-18T22:00:00.000Z"),
      paymentMethod: "pix",
    });

    expect(updateManySpy).toHaveBeenCalledOnce();
    const writtenData = updateManySpy.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(writtenData.data).not.toHaveProperty("pixCopyPaste");
    expect(writtenData.data).not.toHaveProperty("pixQrcodeUrl");
    expect(reconciled.pixCopyPaste).toBe("existing-pix-code");
    expect(reconciled.pixQrcodeUrl).toBe("https://example.com/qr.png");
    expect(reconciled.status).toBe("processing");
  });

  it("discardRefused deletes the CREATING row but leaves the quote's claimedAt untouched, unlike releasePreDispatch", async () => {
    const prisma = durablePrismaFake();
    const store = createPrismaProviderOrderStore(prisma);
    await store.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-18T20:05:00.000Z") });
    const claim = await store.claimForCreation({ quoteUuid, ownerId, now });
    if (claim.kind !== "claimed") throw new Error("expected claim to succeed");

    await store.discardRefused(claim.attempt);

    // The quote row survives with its original `claimedAt` still set (never
    // reset to null, unlike `releasePreDispatch`), so a fresh claim attempt
    // fails closed even though the discarded order row is gone.
    await expect(store.claimForCreation({ quoteUuid, ownerId, now })).resolves.toEqual({ kind: "unavailable" });
  });

  describe("completeCreation recording", () => {
    const orderV2Id = "550e8400-e29b-41d4-a716-446655440055";
    const pairId = "660e8400-e29b-41d4-a716-446655440066";
    const currencyUuid = "770e8400-e29b-41d4-a716-446655440077";
    const exchangeCurrencyUuid = "880e8400-e29b-41d4-a716-446655440088";
    const providerOrderUuid = "990e8400-e29b-41d4-a716-446655440099";

    function orderView(overrides: Record<string, unknown> = {}) {
      return {
        orderUuid: providerOrderUuid,
        status: "new" as const,
        fiatAmount: "1000.0000",
        cryptoAmount: "196.0784",
        nauttQuote: "5.1000",
        expiresAt: new Date("2026-07-18T22:00:00.000Z"),
        paymentMethod: "pix",
        currencySymbol: "BRL",
        ...overrides,
      };
    }

    it("records the observed (owner, pair) evidence in the same transaction as the order write", async () => {
      const prisma = durablePrismaFake();
      prisma.__seedOrderV2({ id: orderV2Id, ownerId, currencyUuid, exchangeCurrencyUuid });
      prisma.__seedPair({ id: pairId, currencyUuid, exchangeCurrencyUuid });
      const store = createPrismaProviderOrderStore(prisma);
      await store.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-18T20:05:00.000Z") });
      const claim = await store.claimForCreation({ quoteUuid, ownerId, now, orderV2Id });
      if (claim.kind !== "claimed") throw new Error("expected claim to succeed");

      const stored = await store.completeCreation(claim.attempt, orderView());

      expect(stored.creationState).toBe("CREATED");
      expect(prisma.__verificationRow(ownerId, pairId)).toMatchObject({
        ownerId,
        pairId,
        observedPaymentMethod: "pix",
        observedCurrencySymbol: "BRL",
      });
    });

    it("records nothing and raises nothing when the provider order has no orderV2Id", async () => {
      const prisma = durablePrismaFake();
      const store = createPrismaProviderOrderStore(prisma);
      await store.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-18T20:05:00.000Z") });
      const claim = await store.claimForCreation({ quoteUuid, ownerId, now });
      if (claim.kind !== "claimed") throw new Error("expected claim to succeed");

      await expect(store.completeCreation(claim.attempt, orderView())).resolves.toMatchObject({ creationState: "CREATED" });
      expect(prisma.__verificationRow(ownerId, pairId)).toBeUndefined();
    });

    it("records nothing when the order_v2 pair no longer resolves to a registered catalog pair", async () => {
      const prisma = durablePrismaFake();
      prisma.__seedOrderV2({ id: orderV2Id, ownerId, currencyUuid, exchangeCurrencyUuid });
      const store = createPrismaProviderOrderStore(prisma);
      await store.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-18T20:05:00.000Z") });
      const claim = await store.claimForCreation({ quoteUuid, ownerId, now, orderV2Id });
      if (claim.kind !== "claimed") throw new Error("expected claim to succeed");

      await expect(store.completeCreation(claim.attempt, orderView())).resolves.toMatchObject({ creationState: "CREATED" });
      expect(prisma.__verificationRow(ownerId, pairId)).toBeUndefined();
    });
  });
});

import { randomUUID } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PrismaClient } from "../../generated/prisma/client";

import { createPrismaProviderOrderStore } from "./provider-order-store";

const ownerId = "110e8400-e29b-41d4-a716-446655440011";
const otherOwnerId = "220e8400-e29b-41d4-a716-446655440022";
const quoteUuid = "330e8400-e29b-41d4-a716-446655440033";
const now = new Date("2026-07-18T20:00:00.000Z");

function durablePrismaFake(): PrismaClient {
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
  };
  const prisma = {
    providerQuote,
    providerOrder,
    async $transaction<T>(callback: (tx: unknown) => Promise<T>) {
      return callback({ providerQuote, providerOrder });
    },
  };
  return prisma as unknown as PrismaClient;
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
});

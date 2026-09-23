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
});

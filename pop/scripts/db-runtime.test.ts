import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabaseClient } from "../../src/db/client";
import { createPrismaProviderOrderStore } from "../../src/integrations/nautt/provider-order-store";
import { createPrismaWebhookDeliveryStore } from "../../src/integrations/nautt/webhook-delivery-store";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDatabase = hasDatabase ? describe : describe.skip;
const prisma = hasDatabase ? getDatabaseClient() : undefined;

describeDatabase("runtime Prisma contract", () => {
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("performs fixture CRUD through only the runtime connection", async () => {
    if (!prisma) {
      throw new Error("DATABASE_URL is required for this database probe");
    }

    const key = `runtime-crud-${process.pid}`;
    const created = await prisma.databaseFoundationFixture.create({
      data: { key, quantity: 1 },
    });

    expect(created.id).toBeTypeOf("bigint");
    expect(created.createdAt).toBeInstanceOf(Date);
    await expect(
      prisma.databaseFoundationFixture.findUniqueOrThrow({ where: { key } }),
    ).resolves.toMatchObject({ quantity: 1 });
    await expect(
      prisma.databaseFoundationFixture.update({
        where: { key },
        data: { quantity: 2 },
      }),
    ).resolves.toMatchObject({ quantity: 2 });
    await prisma.databaseFoundationFixture.delete({ where: { key } });

    console.log("PASS runtime-crud");
  });

  it("persists one owner claim and rejects a stale reconciliation", async () => {
    if (!prisma) throw new Error("DATABASE_URL is required for this database probe");
    const ownerId = crypto.randomUUID();
    const quoteUuid = crypto.randomUUID();
    await prisma.user.create({ data: { id: ownerId, username: `provider.${process.pid}`, role: "USER", status: "ACTIVE" } });
    const store = createPrismaProviderOrderStore(prisma);
    await expect(store.register({ quoteUuid, ownerId, expiresAt: new Date(Date.now() + 60_000) })).resolves.toBe(true);
    const [first, second] = await Promise.all([
      store.claimForCreation({ quoteUuid, ownerId, now: new Date() }),
      store.claimForCreation({ quoteUuid, ownerId, now: new Date() }),
    ]);
    expect([first.kind, second.kind].sort()).toEqual(["claimed", "unavailable"]);
    const attempt = first.kind === "claimed" ? first.attempt : second.kind === "claimed" ? second.attempt : undefined;
    expect(attempt).toBeDefined();
    if (!attempt) throw new Error("claim did not produce an attempt");
    const created = await store.completeCreation(attempt, {
      orderUuid: crypto.randomUUID(), status: "new", fiatAmount: "1000.0000", cryptoAmount: "196.0784", nauttQuote: "5.1000",
      expiresAt: new Date(Date.now() + 60_000), paymentMethod: "pix",
    });
    const stale = await store.findPollable(ownerId, created.id);
    expect(stale).not.toBeNull();
    if (!stale) throw new Error("created order is not pollable");
    const final = await store.reconcile(stale, {
      orderUuid: created.providerOrderUuid!, status: "finished", fiatAmount: "1000.0000", cryptoAmount: "196.0784", nauttQuote: "5.1000",
      expiresAt: new Date(Date.now() + 60_000), paymentMethod: "pix",
    });
    const staleResult = await store.reconcile(stale, {
      orderUuid: created.providerOrderUuid!, status: "processing", fiatAmount: "999.0000", cryptoAmount: "195.0000", nauttQuote: "5.1200",
      expiresAt: new Date(Date.now() + 60_000), paymentMethod: "pix",
    });
    expect(final.status).toBe("finished");
    expect(staleResult.status).toBe("finished");
    expect(staleResult.reconciliationVersion).toBe(final.reconciliationVersion);
    await prisma.user.delete({ where: { id: ownerId } });
    console.log("PASS provider-order-runtime");
  });

  it("claims one durable webhook worker and reclaims an expired lease", async () => {
    if (!prisma) throw new Error("DATABASE_URL is required for this database probe");
    const ownerId = crypto.randomUUID();
    await prisma.user.create({ data: { id: ownerId, username: `webhook.${process.pid}`, role: "USER", status: "ACTIVE" } });
    const store = createPrismaWebhookDeliveryStore(prisma);
    const input = {
      deliveryUuid: crypto.randomUUID(), ownerId, providerOrderUuid: crypto.randomUUID(), eventType: "order.paid",
      providerCreatedAt: new Date("2026-07-17T20:00:00Z"), payloadDigest: "a".repeat(64),
      providerAttemptNumber: 1,
      now: new Date("2026-07-17T20:00:01Z"), leaseExpiresAt: new Date("2026-07-17T20:00:15Z"),
    };
    const results = await Promise.all([store.claim(input), store.claim(input)]);
    expect(results.map((result) => result.kind).sort()).toEqual(["busy", "claimed"]);
    const initial = results.find((result) => result.kind === "claimed");
    const reclaimed = await store.claim({ ...input, now: new Date("2026-07-17T20:00:16Z"), leaseExpiresAt: new Date("2026-07-17T20:00:30Z") });
    expect(reclaimed).toMatchObject({ kind: "claimed", attemptNumber: 3 });
    if (!initial || initial.kind !== "claimed" || reclaimed.kind !== "claimed") throw new Error("claim evidence missing");
    await expect(store.finalize({ deliveryUuid: input.deliveryUuid, attemptNumber: initial.attemptNumber, decision: "PROCESSED", now: new Date() })).rejects.toThrow("finalization changed");
    await expect(store.finalize({ deliveryUuid: input.deliveryUuid, attemptNumber: reclaimed.attemptNumber, decision: "PROCESSED", now: new Date() })).resolves.toBeUndefined();
    await prisma.user.delete({ where: { id: ownerId } });
    console.log("PASS webhook-delivery-runtime");
  });
});

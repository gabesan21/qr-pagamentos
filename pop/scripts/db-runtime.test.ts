import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabaseClient } from "../../src/db/client";
import { createPrismaProviderOrderStore } from "../../src/integrations/nautt/provider-order-store";
import { createPrismaWebhookDeliveryStore } from "../../src/integrations/nautt/webhook-delivery-store";
import { createPrismaWebhookDeliveryRecoveryStore } from "../../src/integrations/nautt/webhook-delivery-recovery-store";

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
      now: new Date("2026-07-17T20:00:01Z"), leaseExpiresAt: new Date("2026-07-17T20:00:17Z"),
    };
    const results = await Promise.all([store.claim(input), store.claim(input)]);
    expect(results.map((result) => result.kind).sort()).toEqual(["busy", "claimed"]);
    const initial = results.find((result) => result.kind === "claimed");
    const reclaimed = await store.claim({ ...input, now: new Date("2026-07-17T20:00:17.001Z"), leaseExpiresAt: new Date("2026-07-17T20:00:33.001Z") });
    expect(reclaimed).toMatchObject({ kind: "claimed", attemptNumber: 3 });
    if (!initial || initial.kind !== "claimed" || reclaimed.kind !== "claimed") throw new Error("claim evidence missing");
    await expect(store.finalize({ deliveryUuid: input.deliveryUuid, attemptNumber: initial.attemptNumber, decision: "PROCESSED", now: new Date() })).rejects.toThrow("finalization changed");
    await expect(store.finalize({ deliveryUuid: input.deliveryUuid, attemptNumber: reclaimed.attemptNumber, decision: "PROCESSED", now: new Date() })).resolves.toBeUndefined();
    const durableDelivery = await prisma.webhookDelivery.findUniqueOrThrow({
      where: { deliveryUuid: input.deliveryUuid },
      include: { attempts: { orderBy: { attemptNumber: "asc" } } },
    });
    expect(durableDelivery).toMatchObject({ decision: "PROCESSED", leaseExpiresAt: null, processingAttemptNumber: null });
    expect(durableDelivery.attempts.map(({ attemptNumber, outcome, providerAttemptNumber, payloadDigest }) => ({
      attemptNumber,
      outcome,
      providerAttemptNumber,
      payloadDigest,
    }))).toEqual([
      { attemptNumber: 1, outcome: "RETRYABLE", providerAttemptNumber: 1, payloadDigest: input.payloadDigest },
      { attemptNumber: 2, outcome: "BUSY", providerAttemptNumber: 1, payloadDigest: input.payloadDigest },
      { attemptNumber: 3, outcome: "PROCESSED", providerAttemptNumber: 1, payloadDigest: input.payloadDigest },
    ]);
    await prisma.user.delete({ where: { id: ownerId } });
    console.log("PASS webhook-delivery-runtime");
  });

  it("fences recovery and atomically records distinct recovery evidence", async () => {
    if (!prisma) throw new Error("DATABASE_URL is required for this database probe");
    const ownerId = crypto.randomUUID();
    const quoteUuid = crypto.randomUUID();
    await prisma.user.create({ data: { id: ownerId, username: `recovery.${process.pid}`, role: "USER", status: "ACTIVE" } });
    const orderStore = createPrismaProviderOrderStore(prisma);
    await orderStore.register({ quoteUuid, ownerId, expiresAt: new Date(Date.now() + 60_000) });
    const creation = await orderStore.claimForCreation({ quoteUuid, ownerId, now: new Date() });
    if (creation.kind !== "claimed") throw new Error("recovery fixture claim unavailable");
    const providerOrderUuid = crypto.randomUUID();
    const order = await orderStore.completeCreation(creation.attempt, {
      orderUuid: providerOrderUuid, status: "new", fiatAmount: "1000.0000", cryptoAmount: "196.0784", nauttQuote: "5.1000",
      expiresAt: new Date(Date.now() + 60_000), paymentMethod: "pix",
    });
    const firstToken = crypto.randomUUID();
    const secondToken = crypto.randomUUID();
    let tokenIndex = 0;
    const recoveryStore = createPrismaWebhookDeliveryRecoveryStore(prisma, () => tokenIndex++ === 0 ? firstToken : secondToken);
    const target = await recoveryStore.findTarget(ownerId, order.id);
    expect(target).toMatchObject({ ownerId, localOrderId: order.id, providerOrderUuid, terminal: false });
    if (!target) throw new Error("recovery target unavailable");
    const first = await recoveryStore.claimLease(target, new Date("2026-07-17T20:00:00Z"), new Date("2026-07-17T20:00:30Z"));
    const busy = await recoveryStore.claimLease(target, new Date("2026-07-17T20:00:24.999Z"), new Date("2026-07-17T20:00:54.999Z"));
    expect(first).toEqual({ kind: "claimed", fenceToken: firstToken });
    expect(busy).toEqual({ kind: "busy" });
    const reclaimed = await recoveryStore.claimLease(target, new Date("2026-07-17T20:00:30Z"), new Date("2026-07-17T20:01:00Z"));
    expect(reclaimed).toEqual({ kind: "claimed", fenceToken: secondToken });
    await expect(recoveryStore.releaseLease(target, firstToken)).resolves.toBe(false);
    const valid = {
      deliveryUuid: crypto.randomUUID(), webhookUuid: crypto.randomUUID(), orderUuid: providerOrderUuid,
      eventType: "order.failed" as const, isDelivered: false, isPermanentlyFailed: true, attemptNumber: 5,
      createdAt: new Date("2026-07-17T20:00:00Z"), decision: "PROCESSED" as const,
    };
    const invalid = { ...valid, deliveryUuid: crypto.randomUUID(), eventType: "order.not-real" as "order.failed" };
    await expect(recoveryStore.complete(target, secondToken, [valid, invalid], new Date())).rejects.toThrow();
    await expect(prisma.webhookDelivery.findUnique({ where: { deliveryUuid: valid.deliveryUuid } })).resolves.toBeNull();
    await expect(recoveryStore.complete(target, secondToken, [valid], new Date())).resolves.toBe(1);
    await expect(recoveryStore.classifyKnownDelivery(valid.deliveryUuid, ownerId, order.id)).resolves.toBe("same-bound");
    const evidence = await prisma.webhookDelivery.findUniqueOrThrow({ where: { deliveryUuid: valid.deliveryUuid }, include: { attempts: true } });
    expect(evidence).toMatchObject({ evidenceSource: "RECOVERY", payloadDigest: null, providerWebhookUuid: valid.webhookUuid, providerIsPermanentlyFailed: true, decision: "PROCESSED" });
    expect(evidence.attempts).toHaveLength(1);
    expect(evidence.attempts[0]).toMatchObject({ evidenceSource: "RECOVERY", payloadDigest: null, outcome: "PROCESSED" });

    const existingDeliveryUuid = crypto.randomUUID();
    const intakeStore = createPrismaWebhookDeliveryStore(prisma);
    const intakeClaim = await intakeStore.claim({
      deliveryUuid: existingDeliveryUuid,
      ownerId,
      providerOrderUuid,
      eventType: "order.paid",
      providerCreatedAt: new Date("2026-07-17T19:00:00Z"),
      providerAttemptNumber: 2,
      payloadDigest: "a".repeat(64),
      now: new Date("2026-07-17T19:00:01Z"),
      leaseExpiresAt: new Date("2026-07-17T19:00:17Z"),
    });
    if (intakeClaim.kind !== "claimed") throw new Error("collision fixture claim unavailable");
    await intakeStore.bindOrder(existingDeliveryUuid, ownerId, order.id);
    await intakeStore.finalize({ deliveryUuid: existingDeliveryUuid, attemptNumber: intakeClaim.attemptNumber, decision: "PROCESSED", now: new Date("2026-07-17T19:00:02Z") });
    const captureKnownTuple = () => prisma.$queryRawUnsafe<Array<{ delivery_bytes: string; attempt_bytes: string }>>(
      `SELECT row_to_json(d)::text AS delivery_bytes,
              COALESCE((SELECT json_agg(row_to_json(a) ORDER BY a.id)::text
                          FROM app.webhook_delivery_attempt a
                         WHERE a.delivery_uuid = d.delivery_uuid), '[]') AS attempt_bytes
         FROM app.webhook_delivery d
        WHERE d.delivery_uuid = $1::uuid`,
      existingDeliveryUuid,
    );
    const knownBefore = await captureKnownTuple();
    expect(knownBefore).toHaveLength(1);
    const collisionFence = await recoveryStore.claimLease(target, new Date("2026-07-17T20:02:00Z"), new Date("2026-07-17T20:02:30Z"));
    if (collisionFence.kind !== "claimed") throw new Error("collision recovery lease unavailable");
    const collisionRecord = {
      ...valid,
      deliveryUuid: existingDeliveryUuid,
      webhookUuid: crypto.randomUUID(),
      eventType: "order.failed" as const,
      attemptNumber: 5,
      createdAt: new Date("2026-07-17T20:02:00Z"),
      decision: "IGNORED" as const,
    };
    const newBatchRecord = { ...collisionRecord, deliveryUuid: crypto.randomUUID() };
    await expect(recoveryStore.complete(target, collisionFence.fenceToken, [collisionRecord, newBatchRecord], new Date("2026-07-17T20:02:05Z"))).resolves.toBe(1);
    const knownAfter = await captureKnownTuple();
    expect(knownAfter).toEqual(knownBefore);
    const newBatchEvidence = await prisma.webhookDelivery.findUniqueOrThrow({
      where: { deliveryUuid: newBatchRecord.deliveryUuid },
      include: { attempts: { orderBy: { id: "asc" } } },
    });
    expect(newBatchEvidence).toMatchObject({
      deliveryUuid: newBatchRecord.deliveryUuid,
      ownerId,
      providerOrderId: order.id,
      providerOrderUuid,
      eventType: "order.failed",
      evidenceSource: "RECOVERY",
      providerWebhookUuid: newBatchRecord.webhookUuid,
      providerIsDelivered: false,
      providerIsPermanentlyFailed: true,
      providerAttemptNumber: 5,
      payloadDigest: null,
      decision: "IGNORED",
    });
    expect(newBatchEvidence.attempts).toHaveLength(1);
    expect(newBatchEvidence.attempts[0]).toMatchObject({
      attemptNumber: 1,
      outcome: "IGNORED",
      evidenceSource: "RECOVERY",
      providerWebhookUuid: newBatchRecord.webhookUuid,
      providerIsDelivered: false,
      providerIsPermanentlyFailed: true,
      providerAttemptNumber: 5,
      payloadDigest: null,
    });
    await prisma.user.delete({ where: { id: ownerId } });
    console.log("PASS webhook-recovery-runtime-collision");
  });
});

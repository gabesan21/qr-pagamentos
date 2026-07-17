import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDatabaseClient } from "../../src/db/client";
import { createPrismaProviderOrderStore } from "../../src/integrations/nautt/provider-order-store";

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
});

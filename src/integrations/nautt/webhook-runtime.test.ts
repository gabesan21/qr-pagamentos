import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const fixtures = vi.hoisted(() => ({
  findUnique: vi.fn(),
  claim: vi.fn(),
  bindOrder: vi.fn(),
  finalize: vi.fn(),
  reconcileWebhookOrder: vi.fn(),
  secretRead: vi.fn(() => { throw new Error("webhook secret must not be read during bypass"); }),
}));
vi.mock("../../db/client", () => ({
  getDatabaseClient: () => ({ providerOrder: { findUnique: fixtures.findUnique }, ownerNauttCredential: { findMany: fixtures.secretRead } }),
}));
vi.mock("./owner-pricing-orders", () => ({ getOwnerPricingOrdersService: () => ({ reconcileWebhookOrder: fixtures.reconcileWebhookOrder }) }));
vi.mock("./webhook-delivery-store", () => ({ createPrismaWebhookDeliveryStore: () => ({ claim: fixtures.claim, bindOrder: fixtures.bindOrder, finalize: fixtures.finalize }) }));
vi.mock("../../lib/nautt-crypto", () => ({ decrypt: fixtures.secretRead, getEncryptionKey: fixtures.secretRead }));

import { handleNauttWebhook } from "./webhook-runtime";
import { createPrismaProviderOrderOwnerResolver } from "./provider-order-store";
import type { PrismaClient } from "../../generated/prisma/client";

const orderUuid = "550e8400-e29b-41d4-a716-446655440012";
const rawBody = Buffer.from(JSON.stringify({
  id: "550e8400-e29b-41d4-a716-446655440011", event: "order.paid", created_at: "2026-07-17T20:00:00Z", data: { uuid: orderUuid },
}));

describe("webhook runtime persisted UUID routing", () => {
  it("resolves unknown UUIDs with one owner-only database lookup and no secret, claim, or provider access", async () => {
    fixtures.findUnique.mockResolvedValue(null);
    await expect(handleNauttWebhook({ rawBody, signature: null })).resolves.toEqual({ status: 204 });
    expect(fixtures.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { providerOrderUuid: orderUuid }, select: { ownerId: true } });
    expect(fixtures.secretRead).not.toHaveBeenCalled();
    expect(fixtures.claim).not.toHaveBeenCalled();
    expect(fixtures.bindOrder).not.toHaveBeenCalled();
    expect(fixtures.finalize).not.toHaveBeenCalled();
    expect(fixtures.reconcileWebhookOrder).not.toHaveBeenCalled();
  });
});

describe("persisted provider order owner resolver", () => {
  it.each(["owner-a", "owner-b"])("returns persisted %s from a global UUID lookup without credentials", async (ownerId) => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId });
    const credentialRead = vi.fn(() => { throw new Error("credential access is forbidden"); });
    const prisma = { providerOrder: { findUnique }, ownerNauttCredential: { findMany: credentialRead } } as unknown as PrismaClient;
    await expect(createPrismaProviderOrderOwnerResolver(prisma)(orderUuid)).resolves.toBe(ownerId);
    expect(findUnique).toHaveBeenCalledExactlyOnceWith({ where: { providerOrderUuid: orderUuid }, select: { ownerId: true } });
    expect(credentialRead).not.toHaveBeenCalled();
  });

  it("propagates database failure rather than treating unavailable ownership as unknown", async () => {
    const findUnique = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const prisma = { providerOrder: { findUnique } } as unknown as PrismaClient;
    await expect(createPrismaProviderOrderOwnerResolver(prisma)(orderUuid)).rejects.toThrow("database unavailable");
  });
});

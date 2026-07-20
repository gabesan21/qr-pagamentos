import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInMemoryWebhookDeliveryStore } from "./webhook-delivery-store";

const identity = {
  deliveryUuid: "550e8400-e29b-41d4-a716-446655440001",
  ownerId: "550e8400-e29b-41d4-a716-446655440002",
  providerOrderUuid: "550e8400-e29b-41d4-a716-446655440003",
  eventType: "order.paid",
  providerCreatedAt: new Date("2026-07-17T20:00:00Z"),
  providerAttemptNumber: 1,
  payloadDigest: "a".repeat(64),
};

describe("webhook delivery store", () => {
  it("allows one concurrent worker, records busy, and reclaims an expired lease", async () => {
    const store = createInMemoryWebhookDeliveryStore();
    const now = new Date("2026-07-17T20:00:01Z");
    const leaseExpiresAt = new Date("2026-07-17T20:00:15Z");
    const [first, second] = await Promise.all([
      store.claim({ ...identity, now, leaseExpiresAt }),
      store.claim({ ...identity, now, leaseExpiresAt }),
    ]);
    expect([first.kind, second.kind]).toEqual(["claimed", "busy"]);
    const reclaimed = await store.claim({ ...identity, now: new Date("2026-07-17T20:00:16Z"), leaseExpiresAt: new Date("2026-07-17T20:00:30Z") });
    expect(reclaimed).toMatchObject({ kind: "claimed", attemptNumber: 3 });
    const stale = first.kind === "claimed" ? first : second.kind === "claimed" ? second : null;
    expect(stale).not.toBeNull();
    if (!stale || reclaimed.kind !== "claimed") throw new Error("claim evidence missing");
    await expect(store.finalize({ deliveryUuid: identity.deliveryUuid, attemptNumber: stale.attemptNumber, decision: "PROCESSED", now: new Date() })).rejects.toThrow("finalization changed");
    await expect(store.finalize({ deliveryUuid: identity.deliveryUuid, attemptNumber: reclaimed.attemptNumber, decision: "PROCESSED", now: new Date() })).resolves.toBeUndefined();
  });

  it("never reclaims terminal work and rejects UUID identity collisions", async () => {
    const store = createInMemoryWebhookDeliveryStore();
    const claim = await store.claim({ ...identity, now: new Date(), leaseExpiresAt: new Date(Date.now() + 1000) });
    expect(claim.kind).toBe("claimed");
    if (claim.kind !== "claimed") throw new Error("claim failed");
    await store.finalize({ deliveryUuid: identity.deliveryUuid, attemptNumber: claim.attemptNumber, decision: "PROCESSED", now: new Date() });
    await expect(store.claim({ ...identity, providerAttemptNumber: 2, payloadDigest: "b".repeat(64), now: new Date(), leaseExpiresAt: new Date(Date.now() + 1000) })).resolves.toMatchObject({ kind: "terminal", decision: "PROCESSED" });
    await expect(store.claim({ ...identity, ownerId: "550e8400-e29b-41d4-a716-446655440099", now: new Date(), leaseExpiresAt: new Date() })).resolves.toEqual({ kind: "conflict" });
  });
});

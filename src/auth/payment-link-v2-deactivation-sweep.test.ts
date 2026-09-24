import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPaymentLinkV2Store } from "./payment-link-v2";
import { createPrismaCheckoutV2Store } from "../checkout/public-checkout-v2";

// 13.2.1: proves the deactivation sweep (src/auth/payment-link-v2.ts) composes
// correctly with the pre-existing, unmodified checkout_attempt_v2 CAS
// (src/checkout/public-checkout-v2.ts) — a swept attempt can never dispatch,
// and an attempt left untouched by the sweep is unaffected.

const ownerId = randomUUID();
const linkId = randomUUID();
const attemptId = randomUUID();
const orderId = randomUUID();
const now = new Date("2026-09-23T12:00:00.000Z");

type AttemptRow = { id: string; paymentLinkV2Id: string; state: string; capabilityRevokedAt: Date | null };
type OrderRow = { id: string; paymentLinkV2Id: string; state: string };
type StateClause = string | { in: string[] } | undefined;

function matchesState(actual: string, clause: StateClause): boolean {
  if (clause === undefined) return true;
  return typeof clause === "string" ? actual === clause : clause.in.includes(actual);
}

function makeFakeDb(initialAttemptState: string) {
  const link = { id: linkId, ownerId, version: 0 };
  const attempt: AttemptRow = { id: attemptId, paymentLinkV2Id: linkId, state: initialAttemptState, capabilityRevokedAt: null };
  const order: OrderRow = { id: orderId, paymentLinkV2Id: linkId, state: "CREATED" };

  const client = {
    paymentLinkV2: {
      updateMany: async ({ where }: { where: { id: string; ownerId: string; version: number } }) => {
        if (where.id !== link.id || where.ownerId !== link.ownerId || where.version !== link.version) return { count: 0 };
        link.version += 1;
        return { count: 1 };
      },
      findFirst: async () => null,
    },
    checkoutAttemptV2: {
      updateMany: async ({ where, data }: { where: { id?: string; paymentLinkV2Id?: string; state?: StateClause }; data: Partial<AttemptRow> }) => {
        if (where.id !== undefined && attempt.id !== where.id) return { count: 0 };
        if (where.paymentLinkV2Id !== undefined && attempt.paymentLinkV2Id !== where.paymentLinkV2Id) return { count: 0 };
        if (!matchesState(attempt.state, where.state)) return { count: 0 };
        Object.assign(attempt, data);
        return { count: 1 };
      },
    },
    orderV2: {
      updateMany: async ({ where, data }: { where: { paymentLinkV2Id?: string; state?: string; checkoutAttempt?: { is: { state: string } } }; data: Partial<OrderRow> }) => {
        if (where.paymentLinkV2Id !== undefined && order.paymentLinkV2Id !== where.paymentLinkV2Id) return { count: 0 };
        if (where.state !== undefined && order.state !== where.state) return { count: 0 };
        if (where.checkoutAttempt?.is?.state !== undefined && attempt.state !== where.checkoutAttempt.is.state) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
    },
  };

  const db = {
    $transaction: async (operation: (tx: typeof client) => unknown) => operation(client),
    paymentLinkV2: client.paymentLinkV2,
    // markCreating reads/writes checkoutAttemptV2 directly on the shared db,
    // outside any transaction — the same row the sweep transaction wrote.
    checkoutAttemptV2: { updateMany: client.checkoutAttemptV2.updateMany, count: async () => 0 },
  };

  return { db, attempt, order, link };
}

describe("deactivation sweep composes with the untouched checkout CAS (13.2.1)", () => {
  it("sweeps a RESERVED attempt to FAILED/REJECTED, and the pre-existing markCreating CAS then refuses it", async () => {
    const { db, attempt, order } = makeFakeDb("RESERVED");
    const linkStore = createPaymentLinkV2Store(db as never);
    const checkoutStore = createPrismaCheckoutV2Store(db as never, Buffer.alloc(32, 1));

    await linkStore.setActive(ownerId, linkId, 0, false, now);

    expect(attempt.state).toBe("FAILED");
    expect(attempt.capabilityRevokedAt).toBe(now);
    expect(order.state).toBe("REJECTED");

    // markCreating is unmodified (src/checkout/public-checkout-v2.ts): its
    // only predicate is state: "RESERVED", so a swept attempt is refused.
    await expect(checkoutStore.markCreating(attemptId)).resolves.toBe(false);
    expect(attempt.state).toBe("FAILED");
  });

  it("never sweeps a CREATING attempt or its still-CREATED order", async () => {
    const { db, attempt, order } = makeFakeDb("CREATING");
    const linkStore = createPaymentLinkV2Store(db as never);
    const checkoutStore = createPrismaCheckoutV2Store(db as never, Buffer.alloc(32, 1));

    await linkStore.setActive(ownerId, linkId, 0, false, now);

    expect(attempt.state).toBe("CREATING");
    expect(attempt.capabilityRevokedAt).toBeNull();
    expect(order.state).toBe("CREATED");

    // Dispatch already in flight keeps completing exactly as before deactivation.
    await expect(checkoutStore.markCreating(attemptId)).resolves.toBe(false);
    expect(attempt.state).toBe("CREATING");
  });

  it("never sweeps a PENDING or INDETERMINATE attempt", async () => {
    for (const state of ["PENDING", "INDETERMINATE"]) {
      const { db, attempt } = makeFakeDb(state);
      const linkStore = createPaymentLinkV2Store(db as never);

      await linkStore.setActive(ownerId, linkId, 0, false, now);

      expect(attempt.state).toBe(state);
      expect(attempt.capabilityRevokedAt).toBeNull();
    }
  });
});

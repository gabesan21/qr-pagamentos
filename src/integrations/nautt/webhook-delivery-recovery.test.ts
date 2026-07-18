import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createWebhookDeliveryRecoveryService,
  HISTORY_DEADLINE_MS,
  NORMALIZED_HISTORY_MAX_RECORDS,
  RECOVERY_ACCEPTED_WORK_BUDGET_MS,
  RECOVERY_LEASE_MS,
} from "./webhook-delivery-recovery";
import type { NormalizedWebhookDelivery, WebhookDeliveryHistoryPort } from "./webhook-delivery-history-port";
import type { WebhookDeliveryRecoveryStore, WebhookRecoveryTarget } from "./webhook-delivery-recovery-store";

const ownerId = "10000000-0000-4000-8000-000000000001";
const localOrderId = "10000000-0000-4000-8000-000000000002";
const orderUuid = "10000000-0000-4000-8000-000000000003";
const webhookUuid = "10000000-0000-4000-8000-000000000004";
const fenceToken = "10000000-0000-4000-8000-000000000005";

function uuid(index: number): string {
  return `20000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function record(index = 1, overrides: Partial<NormalizedWebhookDelivery> = {}): NormalizedWebhookDelivery {
  return {
    deliveryUuid: uuid(index),
    webhookUuid,
    orderUuid,
    eventType: "order.failed",
    isDelivered: false,
    isPermanentlyFailed: true,
    attemptNumber: 5,
    createdAt: new Date("2026-07-17T20:00:00Z"),
    ...overrides,
  };
}

function harness(options: {
  target?: WebhookRecoveryTarget | null;
  classification?: "same-bound" | "conflicting-bound" | "absent";
  lease?: "claimed" | "busy";
  list?: () => Promise<unknown>;
  specific?: () => Promise<unknown>;
  known?: ReadonlySet<string>;
  reconcile?: () => Promise<{ kind: "ignored" } | { kind: "processed"; localOrderId: string }>;
} = {}) {
  const target = options.target === undefined ? { ownerId, localOrderId, providerOrderUuid: orderUuid, terminal: false } : options.target;
  let receivedSignal: AbortSignal | undefined;
  const store = {
    findTarget: vi.fn(async () => target),
    classifyKnownDelivery: vi.fn(async () => options.classification ?? "absent"),
    claimLease: vi.fn(async () => options.lease === "busy" ? { kind: "busy" as const } : { kind: "claimed" as const, fenceToken }),
    releaseLease: vi.fn(async () => true),
    knownDeliveryUuids: vi.fn(async () => options.known ?? new Set<string>()),
    complete: vi.fn(async (_target, _token, records) => records.length),
  } satisfies WebhookDeliveryRecoveryStore;
  const history = {
    listOrderDeliveries: vi.fn(async (_apiKey, _orderUuid, signal) => {
      receivedSignal = signal;
      return options.list ? options.list() : [record()];
    }),
    getDelivery: vi.fn(async (_apiKey, _deliveryUuid, signal) => {
      receivedSignal = signal;
      return options.specific ? options.specific() : record();
    }),
  } satisfies WebhookDeliveryHistoryPort;
  const credentials = { loadActive: vi.fn(async () => ({ apiKey: "sensitive-api-key", webhookUuid })) };
  const orderReconciler = {
    reconcileWebhookOrder: vi.fn(options.reconcile ?? (async () => ({ kind: "processed" as const, localOrderId }))),
  };
  const service = createWebhookDeliveryRecoveryService({ store, history, credentials, orderReconciler });
  return { service, store, history, credentials, orderReconciler, get signal() { return receivedSignal; } };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("webhook delivery recovery", () => {
  it.each(["same-bound", "conflicting-bound"] as const)("known specific %s is a true pre-lease zero-work boundary", async (classification) => {
    const effects = harness({ classification });
    const result = await effects.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "delivery", deliveryUuid: uuid(1) });
    expect(result.kind).toBe(classification === "same-bound" ? "no-op" : "unavailable");
    expect(effects.store.claimLease).not.toHaveBeenCalled();
    expect(effects.store.releaseLease).not.toHaveBeenCalled();
    expect(effects.store.complete).not.toHaveBeenCalled();
    expect(effects.credentials.loadActive).not.toHaveBeenCalled();
    expect(effects.history.getDelivery).not.toHaveBeenCalled();
    expect(effects.orderReconciler.reconcileWebhookOrder).not.toHaveBeenCalled();
  });

  it("conflicting known target and live concurrent lease disclose no work", async () => {
    const missing = harness({ target: null });
    await expect(missing.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(missing.store.claimLease).not.toHaveBeenCalled();
    const busy = harness({ lease: "busy" });
    await expect(busy.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(busy.credentials.loadActive).not.toHaveBeenCalled();
    expect(busy.history.listOrderDeliveries).not.toHaveBeenCalled();
  });

  it("normalized history limit accepts 128 and rejects 129 atomically before per-record work", async () => {
    const atLimit = harness({ list: async () => Array.from({ length: NORMALIZED_HISTORY_MAX_RECORDS }, (_, index) => record(index + 1)) });
    await expect(atLimit.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "reconciled", recordedCount: 128 });
    expect(atLimit.orderReconciler.reconcileWebhookOrder).toHaveBeenCalledTimes(1);
    const overLimit = harness({ list: async () => Array.from({ length: NORMALIZED_HISTORY_MAX_RECORDS + 1 }, (_, index) => record(index + 1)) });
    await expect(overLimit.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(overLimit.store.knownDeliveryUuids).not.toHaveBeenCalled();
    expect(overLimit.orderReconciler.reconcileWebhookOrder).not.toHaveBeenCalled();
    expect(overLimit.store.complete).not.toHaveBeenCalled();
    expect(overLimit.store.releaseLease).toHaveBeenCalledWith(expect.anything(), fenceToken);
  });

  it.each(["resolve", "reject"] as const)("history deadline aborts once and makes late %s inert", async (late) => {
    vi.useFakeTimers();
    let settle!: (value: unknown) => void;
    let reject!: (reason: unknown) => void;
    const pending = new Promise<unknown>((resolve, rejectPromise) => { settle = resolve; reject = rejectPromise; });
    const effects = harness({ list: () => pending });
    const recovery = effects.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" });
    await vi.advanceTimersByTimeAsync(HISTORY_DEADLINE_MS);
    await expect(recovery).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(effects.history.listOrderDeliveries).toHaveBeenCalledTimes(1);
    expect(effects.signal?.aborted).toBe(true);
    expect(effects.store.releaseLease).toHaveBeenCalledTimes(1);
    expect(effects.orderReconciler.reconcileWebhookOrder).not.toHaveBeenCalled();
    expect(effects.store.complete).not.toHaveBeenCalled();
    if (late === "resolve") settle([record()]); else reject(new Error("late sensitive failure"));
    await Promise.resolve();
    await Promise.resolve();
    expect(effects.orderReconciler.reconcileWebhookOrder).not.toHaveBeenCalled();
    expect(effects.store.complete).not.toHaveBeenCalled();
  });

  it("history identity mismatch and malformed normalized evidence fail the whole batch", async () => {
    const mismatch = harness({ list: async () => [record(1), record(2, { webhookUuid: uuid(900) })] });
    await expect(mismatch.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(mismatch.store.complete).not.toHaveBeenCalled();
    const malformed = harness({ list: async () => [{ ...record(), responseStatus: null }] });
    await expect(malformed.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(malformed.orderReconciler.reconcileWebhookOrder).not.toHaveBeenCalled();
  });

  it("history nonpermanent and all-known evidence are no-op with zero order GET", async () => {
    const nonpermanent = harness({ list: async () => [record(1, { isPermanentlyFailed: false })] });
    await expect(nonpermanent.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "no-op", recordedCount: 0 });
    expect(nonpermanent.orderReconciler.reconcileWebhookOrder).not.toHaveBeenCalled();
    const allKnown = harness({ list: async () => [record()], known: new Set([uuid(1)]) });
    await expect(allKnown.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "no-op", recordedCount: 0 });
    expect(allKnown.orderReconciler.reconcileWebhookOrder).not.toHaveBeenCalled();
    expect(allKnown.store.complete).not.toHaveBeenCalled();
  });

  it("permanent terminal history records ignored evidence with zero order GET", async () => {
    const effects = harness({ target: { ownerId, localOrderId, providerOrderUuid: orderUuid, terminal: true } });
    await expect(effects.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "reconciled", recordedCount: 1 });
    expect(effects.orderReconciler.reconcileWebhookOrder).not.toHaveBeenCalled();
    expect(effects.store.complete).toHaveBeenCalledWith(expect.anything(), fenceToken, [expect.objectContaining({ decision: "IGNORED" })], expect.any(Date));
  });

  it("permanent active history batches N deliveries into one authoritative order GET", async () => {
    const effects = harness({ list: async () => [record(1), record(2), record(2)] });
    await expect(effects.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "reconciled", recordedCount: 2 });
    expect(effects.history.listOrderDeliveries).toHaveBeenCalledTimes(1);
    expect(effects.orderReconciler.reconcileWebhookOrder).toHaveBeenCalledTimes(1);
    expect(effects.store.complete).toHaveBeenCalledWith(expect.anything(), fenceToken, expect.arrayContaining([
      expect.objectContaining({ deliveryUuid: uuid(1), decision: "PROCESSED" }),
      expect.objectContaining({ deliveryUuid: uuid(2), decision: "PROCESSED" }),
    ]), expect.any(Date));
  });

  it("provider reconciliation failure leaves no partial recovered batch", async () => {
    const effects = harness({ reconcile: async () => { throw new Error("provider body with secret"); } });
    await expect(effects.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(effects.store.complete).not.toHaveBeenCalled();
    expect(effects.store.releaseLease).toHaveBeenCalledTimes(1);
  });

  it("accepted budget completes history by 10s, order by 20s, and durable persistence by 25s", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const observedAt: { history?: number; order?: number; durable?: number } = {};
    let lease: { token: string; expiresAt: number } | undefined;
    const target = { ownerId, localOrderId, providerOrderUuid: orderUuid, terminal: false };
    const store = {
      findTarget: vi.fn(async () => target),
      classifyKnownDelivery: vi.fn(async () => "absent" as const),
      claimLease: vi.fn(async (_target, now, expiresAt) => {
        if (lease && lease.expiresAt > now.getTime()) return { kind: "busy" as const };
        lease = { token: fenceToken, expiresAt: expiresAt.getTime() };
        return { kind: "claimed" as const, fenceToken };
      }),
      releaseLease: vi.fn(async (_target, token) => {
        if (lease?.token !== token) return false;
        lease = undefined;
        return true;
      }),
      knownDeliveryUuids: vi.fn(async () => new Set<string>()),
      complete: vi.fn(async (_target, token, records) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 5_001));
        if (lease?.token !== token) throw new Error("stale token");
        observedAt.durable = Date.now();
        lease = undefined;
        return records.length;
      }),
    } satisfies WebhookDeliveryRecoveryStore;
    const history = {
      listOrderDeliveries: vi.fn(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 9_999));
        observedAt.history = Date.now();
        return [record()];
      }),
      getDelivery: vi.fn(),
    } as unknown as WebhookDeliveryHistoryPort;
    const orderReconciler = {
      reconcileWebhookOrder: vi.fn(async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
        observedAt.order = Date.now();
        return { kind: "processed" as const, localOrderId };
      }),
    };
    const service = createWebhookDeliveryRecoveryService({
      store,
      history,
      credentials: { loadActive: vi.fn(async () => ({ apiKey: "sensitive-api-key", webhookUuid })) },
      orderReconciler,
    }, () => new Date(Date.now()));

    const successful = service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(observedAt.history).toBe(9_999);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(observedAt.order).toBe(19_999);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(Date.now()).toBe(24_999);
    await expect(service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(history.listOrderDeliveries).toHaveBeenCalledTimes(1);
    expect(orderReconciler.reconcileWebhookOrder).toHaveBeenCalledTimes(1);
    expect(store.complete).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(successful).resolves.toEqual({ kind: "reconciled", recordedCount: 1 });
    expect(observedAt).toEqual({ history: 9_999, order: 19_999, durable: RECOVERY_ACCEPTED_WORK_BUDGET_MS });
    expect(store.claimLease).toHaveBeenNthCalledWith(1, target, new Date(0), new Date(RECOVERY_LEASE_MS));
  });

  it("accepted budget duplicate stays busy until lease expiry and a stale token cannot complete", async () => {
    expect(HISTORY_DEADLINE_MS * 2 + 5_000).toBe(RECOVERY_ACCEPTED_WORK_BUDGET_MS);
    expect(RECOVERY_ACCEPTED_WORK_BUDGET_MS).toBeLessThan(RECOVERY_LEASE_MS);
    expect(RECOVERY_LEASE_MS - RECOVERY_ACCEPTED_WORK_BUDGET_MS).toBe(5_000);
    let currentTime = 0;
    let tokenNumber = 0;
    let lease: { token: string; expiresAt: number } | undefined;
    const completedTokens: string[] = [];
    const target = { ownerId, localOrderId, providerOrderUuid: orderUuid, terminal: false };
    const store = {
      findTarget: vi.fn(async () => target),
      classifyKnownDelivery: vi.fn(async () => "absent" as const),
      claimLease: vi.fn(async (_target, now, expiresAt) => {
        if (lease && lease.expiresAt > now.getTime()) return { kind: "busy" as const };
        const token = uuid(700 + tokenNumber++);
        lease = { token, expiresAt: expiresAt.getTime() };
        return { kind: "claimed" as const, fenceToken: token };
      }),
      releaseLease: vi.fn(async (_target, token) => {
        if (lease?.token !== token) return false;
        lease = undefined;
        return true;
      }),
      knownDeliveryUuids: vi.fn(async () => new Set<string>()),
      complete: vi.fn(async (_target, token, records) => {
        if (lease?.token !== token) throw new Error("stale token");
        completedTokens.push(token);
        lease = undefined;
        return records.length;
      }),
    } satisfies WebhookDeliveryRecoveryStore;
    const history = { listOrderDeliveries: vi.fn(async () => [record()]), getDelivery: vi.fn() } as unknown as WebhookDeliveryHistoryPort;
    let finishFirst!: () => void;
    const heldFirst = new Promise<void>((resolve) => { finishFirst = resolve; });
    const orderReconciler = {
      reconcileWebhookOrder: vi.fn()
        .mockImplementationOnce(async () => { await heldFirst; return { kind: "processed", localOrderId }; })
        .mockResolvedValue({ kind: "processed", localOrderId }),
    };
    const service = createWebhookDeliveryRecoveryService({
      store,
      history,
      credentials: { loadActive: vi.fn(async () => ({ apiKey: "sensitive-api-key", webhookUuid })) },
      orderReconciler,
    }, () => new Date(currentTime));

    const expiredWorker = service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" });
    await vi.waitFor(() => expect(orderReconciler.reconcileWebhookOrder).toHaveBeenCalledTimes(1));
    currentTime = 24_999;
    await expect(service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(history.listOrderDeliveries).toHaveBeenCalledTimes(1);
    expect(orderReconciler.reconcileWebhookOrder).toHaveBeenCalledTimes(1);

    currentTime = RECOVERY_LEASE_MS;
    await expect(service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "order-history" })).resolves.toEqual({ kind: "reconciled", recordedCount: 1 });
    expect(history.listOrderDeliveries).toHaveBeenCalledTimes(2);
    expect(orderReconciler.reconcileWebhookOrder).toHaveBeenCalledTimes(2);
    finishFirst();
    await expect(expiredWorker).resolves.toEqual({ kind: "unavailable", recordedCount: 0 });
    expect(completedTokens).toEqual([uuid(701)]);
  });

  it("specific recovery calls only the selected normalized method", async () => {
    const effects = harness();
    await expect(effects.service.recoverWebhookDeliveries(ownerId, localOrderId, { kind: "delivery", deliveryUuid: uuid(1) })).resolves.toEqual({ kind: "reconciled", recordedCount: 1 });
    expect(effects.history.getDelivery).toHaveBeenCalledTimes(1);
    expect(effects.history.listOrderDeliveries).not.toHaveBeenCalled();
    expect(effects.signal).toBeInstanceOf(AbortSignal);
  });
});

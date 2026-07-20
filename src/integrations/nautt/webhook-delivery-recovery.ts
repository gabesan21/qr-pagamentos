import "server-only";

import { isUuid } from "./decimal";
import {
  normalizeWebhookDelivery,
  type NormalizedWebhookDelivery,
  type WebhookDeliveryHistoryPort,
} from "./webhook-delivery-history-port";
import type {
  RecoveredWebhookEvidence,
  WebhookDeliveryRecoveryStore,
  WebhookRecoveryTarget,
} from "./webhook-delivery-recovery-store";

export const NORMALIZED_HISTORY_MAX_RECORDS = 128;
export const HISTORY_DEADLINE_MS = 10_000;
export const RECOVERY_LEASE_MS = 30_000;
export const RECOVERY_ACCEPTED_WORK_BUDGET_MS = 25_000;

export type WebhookRecoverySelector =
  | { readonly kind: "order-history" }
  | { readonly kind: "delivery"; readonly deliveryUuid: string };

export type WebhookRecoveryResult = {
  readonly kind: "unavailable" | "no-op" | "reconciled";
  readonly recordedCount: number;
};

export interface WebhookRecoveryCredentialPort {
  loadActive(ownerId: string): Promise<{ readonly apiKey: string; readonly webhookUuid: string }>;
}

export interface WebhookRecoveryOrderReconciler {
  reconcileWebhookOrder(ownerId: string, providerOrderUuid: string): Promise<
    { readonly kind: "ignored" } | { readonly kind: "processed"; readonly localOrderId: string }
  >;
}

type TimerPort = {
  set(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clear(timer: ReturnType<typeof setTimeout>): void;
};

const systemTimer: TimerPort = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (timer) => clearTimeout(timer),
};

const UNAVAILABLE: WebhookRecoveryResult = { kind: "unavailable", recordedCount: 0 };

function isSelector(value: unknown): value is WebhookRecoverySelector {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const selector = value as Record<string, unknown>;
  if (selector.kind === "order-history") return Object.keys(selector).length === 1;
  return selector.kind === "delivery" && Object.keys(selector).length === 2 && isUuid(selector.deliveryUuid);
}

async function callHistoryBeforeDeadline(
  call: (signal: AbortSignal) => Promise<unknown>,
  timerPort: TimerPort,
): Promise<{ readonly kind: "settled"; readonly value: unknown } | { readonly kind: "timeout" }> {
  const controller = new AbortController();
  const operation = Promise.resolve().then(() => call(controller.signal));
  operation.catch(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ readonly kind: "timeout" }>((resolve) => {
    timer = timerPort.set(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, HISTORY_DEADLINE_MS);
  });
  try {
    return await Promise.race([
      operation.then((value) => ({ kind: "settled" as const, value })),
      deadline,
    ]);
  } finally {
    if (timer !== undefined) timerPort.clear(timer);
  }
}

function normalizedRecords(selector: WebhookRecoverySelector, value: unknown): NormalizedWebhookDelivery[] | null {
  if (selector.kind === "order-history") {
    if (!Array.isArray(value)) return null;
    if (value.length > NORMALIZED_HISTORY_MAX_RECORDS) return null;
    const records = value.map(normalizeWebhookDelivery);
    return records.every((record): record is NormalizedWebhookDelivery => record !== null) ? records : null;
  }
  const record = normalizeWebhookDelivery(value);
  return record ? [record] : null;
}

function identityMatches(
  record: NormalizedWebhookDelivery,
  selector: WebhookRecoverySelector,
  target: WebhookRecoveryTarget,
  webhookUuid: string,
): boolean {
  return record.orderUuid === target.providerOrderUuid &&
    record.webhookUuid === webhookUuid &&
    (selector.kind !== "delivery" || record.deliveryUuid === selector.deliveryUuid);
}

export function createWebhookDeliveryRecoveryService(
  dependencies: {
    readonly store: WebhookDeliveryRecoveryStore;
    readonly credentials: WebhookRecoveryCredentialPort;
    readonly history: WebhookDeliveryHistoryPort;
    readonly orderReconciler: WebhookRecoveryOrderReconciler;
  },
  now: () => Date = () => new Date(),
  timerPort: TimerPort = systemTimer,
) {
  return {
    async recoverWebhookDeliveries(
      ownerId: string,
      localOrderId: string,
      selector: WebhookRecoverySelector,
    ): Promise<WebhookRecoveryResult> {
      if (!isUuid(ownerId) || !isUuid(localOrderId) || !isSelector(selector)) return UNAVAILABLE;

      let target: WebhookRecoveryTarget | null;
      try {
        target = await dependencies.store.findTarget(ownerId, localOrderId);
      } catch {
        return UNAVAILABLE;
      }
      if (!target) return UNAVAILABLE;

      if (selector.kind === "delivery") {
        try {
          const classification = await dependencies.store.classifyKnownDelivery(
            selector.deliveryUuid,
            target.ownerId,
            target.localOrderId,
          );
          if (classification !== "absent") return classification === "same-bound" ? { kind: "no-op", recordedCount: 0 } : UNAVAILABLE;
        } catch {
          return UNAVAILABLE;
        }
      }

      const startedAt = now();
      let claim;
      try {
        claim = await dependencies.store.claimLease(target, startedAt, new Date(startedAt.getTime() + RECOVERY_LEASE_MS));
      } catch {
        return UNAVAILABLE;
      }
      if (claim.kind !== "claimed") return UNAVAILABLE;
      const { fenceToken } = claim;

      let apiKey = "";
      try {
        const credential = await dependencies.credentials.loadActive(target.ownerId);
        if (!isUuid(credential.webhookUuid) || !credential.apiKey) throw new Error("credential unavailable");
        apiKey = credential.apiKey;

        const historyResult = await callHistoryBeforeDeadline(
          selector.kind === "order-history"
            ? (signal) => dependencies.history.listOrderDeliveries(apiKey, target.providerOrderUuid, signal)
            : (signal) => dependencies.history.getDelivery(apiKey, selector.deliveryUuid, signal),
          timerPort,
        );
        if (historyResult.kind === "timeout") throw new Error("history unavailable");

        if (
          selector.kind === "order-history" &&
          Array.isArray(historyResult.value) &&
          historyResult.value.length > NORMALIZED_HISTORY_MAX_RECORDS
        ) throw new Error("normalized history exceeds local bound");

        const records = normalizedRecords(selector, historyResult.value);
        if (!records || records.some((record) => !identityMatches(record, selector, target, credential.webhookUuid))) {
          throw new Error("history unavailable");
        }

        const distinctPermanentFailures = [...new Map(
          records.filter((record) => record.isPermanentlyFailed).map((record) => [record.deliveryUuid, record]),
        ).values()];
        if (distinctPermanentFailures.length === 0) {
          if (!await dependencies.store.releaseLease(target, fenceToken)) throw new Error("lease changed");
          return { kind: "no-op", recordedCount: 0 };
        }

        const known = await dependencies.store.knownDeliveryUuids(distinctPermanentFailures.map((record) => record.deliveryUuid));
        const unseen = distinctPermanentFailures.filter((record) => !known.has(record.deliveryUuid));
        if (unseen.length === 0) {
          if (!await dependencies.store.releaseLease(target, fenceToken)) throw new Error("lease changed");
          return { kind: "no-op", recordedCount: 0 };
        }

        let decision: RecoveredWebhookEvidence["decision"] = "IGNORED";
        if (!target.terminal) {
          const reconciled = await dependencies.orderReconciler.reconcileWebhookOrder(target.ownerId, target.providerOrderUuid);
          decision = reconciled.kind === "processed" ? "PROCESSED" : "IGNORED";
        }
        const recordedCount = await dependencies.store.complete(
          target,
          fenceToken,
          unseen.map((record) => ({ ...record, decision })),
          now(),
        );
        return recordedCount === 0 ? { kind: "no-op", recordedCount: 0 } : { kind: "reconciled", recordedCount };
      } catch {
        await dependencies.store.releaseLease(target, fenceToken).catch(() => false);
        return UNAVAILABLE;
      } finally {
        apiKey = "";
      }
    },
  };
}

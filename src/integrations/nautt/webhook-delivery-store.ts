import "server-only";

import type { PrismaClient } from "../../generated/prisma/client";

export const WEBHOOK_TERMINAL_DECISIONS = ["PROCESSED", "IGNORED"] as const;
export type WebhookTerminalDecision = (typeof WEBHOOK_TERMINAL_DECISIONS)[number];
export type WebhookCompletedDecision = WebhookTerminalDecision | "REJECTED";
export type WebhookAttemptOutcome = "CLAIMED" | "BUSY" | WebhookCompletedDecision | "RETRYABLE";

export type WebhookDeliveryIdentity = {
  readonly deliveryUuid: string;
  readonly ownerId: string;
  readonly providerOrderUuid: string;
  readonly eventType: string;
  readonly providerCreatedAt: Date;
  readonly providerAttemptNumber: number | null;
  readonly payloadDigest: string;
};

export type WebhookClaim =
  | { readonly kind: "claimed"; readonly attemptNumber: number }
  | { readonly kind: "terminal"; readonly decision: WebhookTerminalDecision; readonly attemptNumber: number }
  | { readonly kind: "busy"; readonly attemptNumber: number }
  | { readonly kind: "conflict" };

export interface WebhookDeliveryStore {
  claim(input: WebhookDeliveryIdentity & { readonly now: Date; readonly leaseExpiresAt: Date }): Promise<WebhookClaim>;
  bindOrder(deliveryUuid: string, ownerId: string, providerOrderId: string): Promise<void>;
  finalize(input: {
    readonly deliveryUuid: string;
    readonly attemptNumber: number;
    readonly decision: WebhookCompletedDecision | "RETRYABLE";
    readonly now: Date;
  }): Promise<void>;
}

type LockedDelivery = {
  owner_id: string;
  provider_order_uuid: string;
  event_type: string;
  provider_created_at: Date;
  provider_attempt_number: number | null;
  payload_digest: string;
  decision: string;
  lease_expires_at: Date | null;
  processing_attempt_number: number | null;
};

export function createPrismaWebhookDeliveryStore(prisma: PrismaClient): WebhookDeliveryStore {
  return {
    async claim(input) {
      const deliveryUuid = input.deliveryUuid.toLowerCase();
      const ownerId = input.ownerId.toLowerCase();
      const providerOrderUuid = input.providerOrderUuid.toLowerCase();
      return prisma.$transaction(async (tx): Promise<WebhookClaim> => {
        await tx.$executeRawUnsafe(
          `INSERT INTO app.webhook_delivery
             (delivery_uuid, owner_id, provider_order_uuid, event_type, provider_created_at, provider_attempt_number, payload_digest)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::timestamptz, $6, $7)
           ON CONFLICT (delivery_uuid) DO NOTHING`,
          deliveryUuid,
          ownerId,
          providerOrderUuid,
          input.eventType,
          input.providerCreatedAt,
          input.providerAttemptNumber,
          input.payloadDigest,
        );
        const rows = await tx.$queryRawUnsafe<LockedDelivery[]>(
          `SELECT owner_id, provider_order_uuid, event_type, provider_created_at, provider_attempt_number, payload_digest, decision, lease_expires_at, processing_attempt_number
             FROM app.webhook_delivery WHERE delivery_uuid = $1::uuid FOR UPDATE`,
          deliveryUuid,
        );
        const row = rows[0];
        if (
          !row ||
          row.owner_id.toLowerCase() !== ownerId ||
          row.provider_order_uuid.toLowerCase() !== providerOrderUuid ||
          row.event_type !== input.eventType
        ) {
          return { kind: "conflict" };
        }

        const maximum = await tx.webhookDeliveryAttempt.aggregate({
          where: { deliveryUuid },
          _max: { attemptNumber: true },
        });
        const attemptNumber = (maximum._max.attemptNumber ?? 0) + 1;
        if ((WEBHOOK_TERMINAL_DECISIONS as readonly string[]).includes(row.decision)) {
          const decision = row.decision as WebhookTerminalDecision;
          await tx.webhookDeliveryAttempt.create({
            data: { deliveryUuid, attemptNumber, outcome: decision, providerAttemptNumber: input.providerAttemptNumber, payloadDigest: input.payloadDigest, completedAt: input.now },
          });
          return { kind: "terminal", decision, attemptNumber };
        }
        if (row.decision === "PROCESSING" && row.lease_expires_at && row.lease_expires_at > input.now) {
          await tx.webhookDeliveryAttempt.create({
            data: { deliveryUuid, attemptNumber, outcome: "BUSY", providerAttemptNumber: input.providerAttemptNumber, payloadDigest: input.payloadDigest, completedAt: input.now },
          });
          return { kind: "busy", attemptNumber };
        }
        if (row.decision === "PROCESSING" && row.processing_attempt_number !== null) {
          const expired = await tx.webhookDeliveryAttempt.updateMany({
            where: {
              deliveryUuid,
              attemptNumber: row.processing_attempt_number,
              outcome: "CLAIMED",
              completedAt: null,
            },
            data: { outcome: "RETRYABLE", completedAt: input.now },
          });
          if (expired.count !== 1) throw new Error("expired webhook attempt evidence changed");
        }
        await tx.webhookDelivery.update({
          where: { deliveryUuid },
          data: { decision: "PROCESSING", leaseExpiresAt: input.leaseExpiresAt, processingAttemptNumber: attemptNumber, updatedAt: input.now },
        });
        await tx.webhookDeliveryAttempt.create({
          data: { deliveryUuid, attemptNumber, outcome: "CLAIMED", providerAttemptNumber: input.providerAttemptNumber, payloadDigest: input.payloadDigest },
        });
        return { kind: "claimed", attemptNumber };
      });
    },

    async bindOrder(deliveryUuid, ownerId, providerOrderId) {
      const normalizedDeliveryUuid = deliveryUuid.toLowerCase();
      const normalizedOwnerId = ownerId.toLowerCase();
      const normalizedProviderOrderId = providerOrderId.toLowerCase();
      const result = await prisma.webhookDelivery.updateMany({
        where: { deliveryUuid: normalizedDeliveryUuid, ownerId: normalizedOwnerId, providerOrderId: null },
        data: { providerOrderId: normalizedProviderOrderId },
      });
      if (result.count !== 1) {
        const current = await prisma.webhookDelivery.findUnique({ where: { deliveryUuid: normalizedDeliveryUuid }, select: { providerOrderId: true } });
        if (current?.providerOrderId?.toLowerCase() !== normalizedProviderOrderId) throw new Error("webhook delivery order binding changed");
      }
    },

    async finalize({ deliveryUuid, attemptNumber, decision, now }) {
      const normalizedDeliveryUuid = deliveryUuid.toLowerCase();
      await prisma.$transaction(async (tx) => {
        const delivery = await tx.webhookDelivery.updateMany({
          where: { deliveryUuid: normalizedDeliveryUuid, decision: "PROCESSING", processingAttemptNumber: attemptNumber },
          data: { decision, leaseExpiresAt: null, processingAttemptNumber: null, updatedAt: now },
        });
        const attempt = await tx.webhookDeliveryAttempt.updateMany({
          where: { deliveryUuid: normalizedDeliveryUuid, attemptNumber, outcome: "CLAIMED", completedAt: null },
          data: { outcome: decision, completedAt: now },
        });
        if (delivery.count !== 1 || attempt.count !== 1) throw new Error("webhook delivery finalization changed");
      });
    },
  };
}

export function createInMemoryWebhookDeliveryStore(): WebhookDeliveryStore {
  type Entry = WebhookDeliveryIdentity & {
    decision: "PROCESSING" | WebhookCompletedDecision | "RETRYABLE";
    leaseExpiresAt: Date | null;
    providerOrderId: string | null;
    processingAttemptNumber: number | null;
    attempts: Array<{ outcome: WebhookAttemptOutcome; providerAttemptNumber: number | null; payloadDigest: string }>;
  };
  const entries = new Map<string, Entry>();
  return {
    claim(input) {
      const deliveryUuid = input.deliveryUuid.toLowerCase();
      const ownerId = input.ownerId.toLowerCase();
      const providerOrderUuid = input.providerOrderUuid.toLowerCase();
      const existing = entries.get(deliveryUuid);
      if (existing && (
        existing.ownerId.toLowerCase() !== ownerId ||
        existing.providerOrderUuid.toLowerCase() !== providerOrderUuid ||
        existing.eventType !== input.eventType
      )) return Promise.resolve({ kind: "conflict" });
      const entry = existing ?? {
        ...input,
        deliveryUuid,
        ownerId,
        providerOrderUuid,
        decision: "RETRYABLE" as const,
        leaseExpiresAt: null,
        providerOrderId: null,
        processingAttemptNumber: null,
        attempts: [],
      };
      entries.set(deliveryUuid, entry);
      const attemptNumber = entry.attempts.length + 1;
      if ((WEBHOOK_TERMINAL_DECISIONS as readonly string[]).includes(entry.decision)) {
        entry.attempts.push({ outcome: entry.decision as WebhookTerminalDecision, providerAttemptNumber: input.providerAttemptNumber, payloadDigest: input.payloadDigest });
        return Promise.resolve({ kind: "terminal", decision: entry.decision as WebhookTerminalDecision, attemptNumber });
      }
      if (entry.decision === "PROCESSING" && entry.leaseExpiresAt && entry.leaseExpiresAt > input.now) {
        entry.attempts.push({ outcome: "BUSY", providerAttemptNumber: input.providerAttemptNumber, payloadDigest: input.payloadDigest });
        return Promise.resolve({ kind: "busy", attemptNumber });
      }
      if (entry.decision === "PROCESSING" && entry.processingAttemptNumber !== null) {
        const expiredAttempt = entry.attempts[entry.processingAttemptNumber - 1];
        if (expiredAttempt?.outcome !== "CLAIMED") return Promise.reject(new Error("expired webhook attempt evidence changed"));
        expiredAttempt.outcome = "RETRYABLE";
      }
      entry.decision = "PROCESSING";
      entry.leaseExpiresAt = input.leaseExpiresAt;
      entry.processingAttemptNumber = attemptNumber;
      entry.attempts.push({ outcome: "CLAIMED", providerAttemptNumber: input.providerAttemptNumber, payloadDigest: input.payloadDigest });
      return Promise.resolve({ kind: "claimed", attemptNumber });
    },
    bindOrder(deliveryUuid, ownerId, providerOrderId) {
      const normalizedDeliveryUuid = deliveryUuid.toLowerCase();
      const normalizedOwnerId = ownerId.toLowerCase();
      const normalizedProviderOrderId = providerOrderId.toLowerCase();
      const entry = entries.get(normalizedDeliveryUuid);
      if (!entry || entry.ownerId.toLowerCase() !== normalizedOwnerId || (entry.providerOrderId && entry.providerOrderId.toLowerCase() !== normalizedProviderOrderId)) {
        return Promise.reject(new Error("webhook delivery order binding changed"));
      }
      entry.providerOrderId = normalizedProviderOrderId;
      return Promise.resolve();
    },
    finalize({ deliveryUuid, attemptNumber, decision }) {
      const normalizedDeliveryUuid = deliveryUuid.toLowerCase();
      const entry = entries.get(normalizedDeliveryUuid);
      if (!entry || entry.decision !== "PROCESSING" || entry.processingAttemptNumber !== attemptNumber || entry.attempts[attemptNumber - 1]?.outcome !== "CLAIMED") {
        return Promise.reject(new Error("webhook delivery finalization changed"));
      }
      entry.decision = decision;
      entry.leaseExpiresAt = null;
      entry.processingAttemptNumber = null;
      entry.attempts[attemptNumber - 1].outcome = decision;
      return Promise.resolve();
    },
  };
}

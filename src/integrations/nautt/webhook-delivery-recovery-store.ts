import "server-only";

import { randomUUID } from "node:crypto";

import type { PrismaClient } from "../../generated/prisma/client";
import { FINAL_ORDER_STATUSES } from "./provider-order-store";
import type { NormalizedWebhookDelivery } from "./webhook-delivery-history-port";
import type { WebhookTerminalDecision } from "./webhook-delivery-store";

export type WebhookRecoveryTarget = {
  readonly ownerId: string;
  readonly localOrderId: string;
  readonly providerOrderUuid: string;
  readonly terminal: boolean;
};

export type KnownDeliveryClassification = "same-bound" | "conflicting-bound" | "absent";

export type WebhookRecoveryLeaseClaim =
  | { readonly kind: "claimed"; readonly fenceToken: string }
  | { readonly kind: "busy" };

export type RecoveredWebhookEvidence = NormalizedWebhookDelivery & {
  readonly decision: Extract<WebhookTerminalDecision, "PROCESSED" | "IGNORED">;
};

export interface WebhookDeliveryRecoveryStore {
  findTarget(ownerId: string, localOrderId: string): Promise<WebhookRecoveryTarget | null>;
  classifyKnownDelivery(deliveryUuid: string, ownerId: string, localOrderId: string): Promise<KnownDeliveryClassification>;
  claimLease(target: WebhookRecoveryTarget, now: Date, leaseExpiresAt: Date): Promise<WebhookRecoveryLeaseClaim>;
  releaseLease(target: WebhookRecoveryTarget, fenceToken: string): Promise<boolean>;
  knownDeliveryUuids(deliveryUuids: readonly string[]): Promise<ReadonlySet<string>>;
  complete(target: WebhookRecoveryTarget, fenceToken: string, records: readonly RecoveredWebhookEvidence[], now: Date): Promise<number>;
}

type TargetRow = {
  id: string;
  owner_id: string;
  provider_order_uuid: string;
  status: string | null;
};

export function createPrismaWebhookDeliveryRecoveryStore(
  prisma: PrismaClient,
  createFenceToken: () => string = randomUUID,
): WebhookDeliveryRecoveryStore {
  return {
    async findTarget(ownerId, localOrderId) {
      const rows = await prisma.$queryRawUnsafe<TargetRow[]>(
        `SELECT id, owner_id, provider_order_uuid, status
           FROM app.provider_order
          WHERE id = $1::uuid AND owner_id = $2::uuid AND provider_order_uuid IS NOT NULL`,
        localOrderId,
        ownerId,
      );
      const row = rows[0];
      if (!row) return null;
      return {
        ownerId: row.owner_id,
        localOrderId: row.id,
        providerOrderUuid: row.provider_order_uuid,
        terminal: row.status !== null && (FINAL_ORDER_STATUSES as readonly string[]).includes(row.status),
      };
    },

    async classifyKnownDelivery(deliveryUuid, ownerId, localOrderId) {
      const rows = await prisma.$queryRawUnsafe<Array<{ owner_id: string; provider_order_id: string | null }>>(
        `SELECT owner_id, provider_order_id FROM app.webhook_delivery WHERE delivery_uuid = $1::uuid`,
        deliveryUuid,
      );
      const row = rows[0];
      if (!row) return "absent";
      return row.owner_id === ownerId && row.provider_order_id === localOrderId ? "same-bound" : "conflicting-bound";
    },

    async claimLease(target, now, leaseExpiresAt) {
      const fenceToken = createFenceToken();
      const rows = await prisma.$queryRawUnsafe<Array<{ fence_token: string }>>(
        `INSERT INTO app.webhook_recovery_lease
           (provider_order_id, owner_id, fence_token, lease_expires_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz)
         ON CONFLICT (provider_order_id) DO UPDATE
           SET fence_token = EXCLUDED.fence_token,
               lease_expires_at = EXCLUDED.lease_expires_at,
               updated_at = EXCLUDED.updated_at
         WHERE app.webhook_recovery_lease.owner_id = EXCLUDED.owner_id
           AND app.webhook_recovery_lease.lease_expires_at <= $5::timestamptz
         RETURNING fence_token`,
        target.localOrderId,
        target.ownerId,
        fenceToken,
        leaseExpiresAt,
        now,
      );
      return rows[0]?.fence_token === fenceToken ? { kind: "claimed", fenceToken } : { kind: "busy" };
    },

    async releaseLease(target, fenceToken) {
      const deleted = await prisma.webhookRecoveryLease.deleteMany({
        where: { providerOrderId: target.localOrderId, ownerId: target.ownerId, fenceToken },
      });
      return deleted.count === 1;
    },

    async knownDeliveryUuids(deliveryUuids) {
      if (deliveryUuids.length === 0) return new Set<string>();
      const rows = await prisma.webhookDelivery.findMany({
        where: { deliveryUuid: { in: [...deliveryUuids] } },
        select: { deliveryUuid: true },
      });
      return new Set(rows.map((row) => row.deliveryUuid));
    },

    async complete(target, fenceToken, records, now) {
      return prisma.$transaction(async (tx) => {
        const lease = await tx.$queryRawUnsafe<Array<{ fence_token: string }>>(
          `SELECT fence_token FROM app.webhook_recovery_lease
            WHERE provider_order_id = $1::uuid AND owner_id = $2::uuid
            FOR UPDATE`,
          target.localOrderId,
          target.ownerId,
        );
        if (lease[0]?.fence_token !== fenceToken) throw new Error("webhook recovery lease changed");

        let recordedCount = 0;
        for (const record of records) {
          const inserted = await tx.$queryRawUnsafe<Array<{ delivery_uuid: string }>>(
            `INSERT INTO app.webhook_delivery
               (delivery_uuid, owner_id, provider_order_id, provider_order_uuid, event_type, provider_created_at,
                provider_attempt_number, evidence_source, provider_webhook_uuid, provider_is_delivered,
                provider_is_permanently_failed, payload_digest, decision, updated_at)
             VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::timestamptz,
                     $7, 'RECOVERY', $8::uuid, $9, TRUE, NULL, $10, $11::timestamptz)
             ON CONFLICT (delivery_uuid) DO NOTHING
             RETURNING delivery_uuid`,
            record.deliveryUuid,
            target.ownerId,
            target.localOrderId,
            target.providerOrderUuid,
            record.eventType,
            record.createdAt,
            record.attemptNumber,
            record.webhookUuid,
            record.isDelivered,
            record.decision,
            now,
          );
          if (inserted.length === 0) continue;
          await tx.webhookDeliveryAttempt.create({
            data: {
              deliveryUuid: record.deliveryUuid,
              attemptNumber: 1,
              outcome: record.decision,
              providerAttemptNumber: record.attemptNumber,
              evidenceSource: "RECOVERY",
              providerWebhookUuid: record.webhookUuid,
              providerIsDelivered: record.isDelivered,
              providerIsPermanentlyFailed: true,
              payloadDigest: null,
              completedAt: now,
            },
          });
          recordedCount += 1;
        }
        const removed = await tx.webhookRecoveryLease.deleteMany({
          where: { providerOrderId: target.localOrderId, ownerId: target.ownerId, fenceToken },
        });
        if (removed.count !== 1) throw new Error("webhook recovery lease changed");
        return recordedCount;
      });
    },
  };
}

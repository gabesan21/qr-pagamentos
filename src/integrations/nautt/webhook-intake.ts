import "server-only";

import { createHash } from "node:crypto";

import {
  parseRejectedWebhookIdentity,
  parseWebhookEnvelope,
  type WebhookEnvelopeRejectionReason,
  type RejectedWebhookIdentity,
} from "./webhook-envelope";
import type { WebhookDeliveryStore } from "./webhook-delivery-store";
import { logWebhookRejection } from "../../observability/webhook-rejection-log";

export const WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS = 14_500;
export const WEBHOOK_LEASE_SAFETY_MARGIN_MS = 1_500;
export const WEBHOOK_PROCESSING_LEASE_MS = WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS + WEBHOOK_LEASE_SAFETY_MARGIN_MS;

export type WebhookIntakeResult = { readonly status: 204 | 400 | 401 | 503 };

export type WebhookOrderReconciler = {
  reconcileWebhookOrder(ownerId: string, providerOrderUuid: string): Promise<
    { readonly kind: "ignored" } | { readonly kind: "processed"; readonly localOrderId: string }
  >;
};

export type WebhookIntakeDependencies = {
  readonly resolveOrderOwner: (providerOrderUuid: string) => Promise<string | null>;
  readonly deliveryStore: WebhookDeliveryStore;
  readonly orderReconciler: WebhookOrderReconciler;
  readonly now?: () => Date;
  readonly parseEnvelope?: typeof parseWebhookEnvelope;
  readonly parseRejectedIdentity?: (rawBody: Buffer, delivery: string | null, event: string | null) => RejectedWebhookIdentity | null;
};

export function createWebhookIntake(dependencies: WebhookIntakeDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const parseEnvelope = dependencies.parseEnvelope ?? parseWebhookEnvelope;
  const parseRejectedIdentity = dependencies.parseRejectedIdentity ?? parseRejectedWebhookIdentity;
  return async function intake(input: {
    readonly rawBody: Buffer;
    readonly signature: string | null;
    readonly delivery: string | null;
    readonly event: string | null;
  }): Promise<WebhookIntakeResult> {
    const payloadDigest = createHash("sha256").update(input.rawBody).digest("hex");
    let rejectionReason: WebhookEnvelopeRejectionReason = "schema_invalid";
    const envelope = parseEnvelope(input.rawBody, input.delivery, input.event, (reason) => {
      rejectionReason = reason;
    });
    if (!envelope) {
      const rejected = parseRejectedIdentity(input.rawBody, input.delivery, input.event);
      if (rejected) {
        let ownerId: string | null;
        try {
          ownerId = await dependencies.resolveOrderOwner(rejected.providerOrderUuid);
        } catch {
          return { status: 503 };
        }
        if (ownerId) {
          const rejectedAt = now();
          try {
            const rejectedClaim = await dependencies.deliveryStore.claim({
              deliveryUuid: rejected.deliveryUuid,
              providerOrderUuid: rejected.providerOrderUuid,
              eventType: rejected.eventType,
              providerCreatedAt: rejected.createdAt,
              providerAttemptNumber: null,
              ownerId,
              payloadDigest,
              now: rejectedAt,
              leaseExpiresAt: new Date(rejectedAt.getTime() + WEBHOOK_PROCESSING_LEASE_MS),
            });
            if (rejectedClaim.kind === "claimed") {
              await dependencies.deliveryStore.finalize({
                deliveryUuid: rejected.deliveryUuid,
                attemptNumber: rejectedClaim.attemptNumber,
                decision: "REJECTED",
                now: now(),
              });
            }
          } catch {
            return { status: 503 };
          }
        }
      }
      logWebhookRejection(rejectionReason, rejected?.deliveryUuid ?? input.delivery, rejected?.eventType ?? input.event);
      return { status: 400 };
    }
    let ownerId: string | null;
    try {
      ownerId = await dependencies.resolveOrderOwner(envelope.providerOrderUuid);
    } catch {
      return { status: 503 };
    }
    // Unknown provider orders cannot select a merchant or trigger provider requests.
    if (!ownerId) return { status: 204 };

    // USER-AUTHORIZED TEMPORARY PRODUCTION TEST: signature enforcement is disabled.
    // Restore only after UUID ownership resolution; never discover owners by HMAC matching.
    // const secret = await dependencies.loadOwnerWebhookSecret(ownerId);
    // if (!secret || !verifyWebhookSignature(input.rawBody, input.signature, secret)) {
    //   logWebhookRejection("unmatched", envelope.deliveryUuid, envelope.eventType);
    //   return { status: 401 };
    // }
    const acceptedAt = now();
    let claim;
    try {
      claim = await dependencies.deliveryStore.claim({
        deliveryUuid: envelope.deliveryUuid,
        ownerId,
        providerOrderUuid: envelope.providerOrderUuid,
        eventType: envelope.eventType,
        providerCreatedAt: envelope.createdAt,
        providerAttemptNumber: envelope.providerAttemptNumber,
        payloadDigest,
        now: acceptedAt,
        leaseExpiresAt: new Date(acceptedAt.getTime() + WEBHOOK_PROCESSING_LEASE_MS),
      });
    } catch {
      return { status: 503 };
    }
    if (claim.kind === "conflict") {
      logWebhookRejection("claim_identity_conflict", envelope.deliveryUuid, envelope.eventType);
      return { status: 400 };
    }
    if (claim.kind === "terminal") return { status: 204 };
    if (claim.kind === "busy") return { status: 503 };

    try {
      const reconciled = await dependencies.orderReconciler.reconcileWebhookOrder(ownerId, envelope.providerOrderUuid);
      if (reconciled.kind === "processed") {
        await dependencies.deliveryStore.bindOrder(envelope.deliveryUuid, ownerId, reconciled.localOrderId);
      }
      await dependencies.deliveryStore.finalize({
        deliveryUuid: envelope.deliveryUuid,
        attemptNumber: claim.attemptNumber,
        decision: reconciled.kind === "processed" ? "PROCESSED" : "IGNORED",
        now: now(),
      });
      return { status: 204 };
    } catch {
      await dependencies.deliveryStore.finalize({
        deliveryUuid: envelope.deliveryUuid,
        attemptNumber: claim.attemptNumber,
        decision: "RETRYABLE",
        now: now(),
      }).catch(() => undefined);
      return { status: 503 };
    }
  };
}

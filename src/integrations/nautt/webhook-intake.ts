import "server-only";

import { createHash } from "node:crypto";

import {
  parseRejectedWebhookIdentity,
  parseWebhookEnvelope,
  type NauttWebhookEnvelope,
  type RejectedWebhookIdentity,
} from "./webhook-envelope";
import type { WebhookDeliveryStore } from "./webhook-delivery-store";
import type { WebhookSecretCandidate } from "./webhook-signature";

export const WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS = 14_500;
export const WEBHOOK_LEASE_SAFETY_MARGIN_MS = 1_500;
export const WEBHOOK_PROCESSING_LEASE_MS = WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS + WEBHOOK_LEASE_SAFETY_MARGIN_MS;

// BETA(M-5.1): unverified webhook intake — human decision 2026-07-25; HMAC verification skipped entirely; MUST be reversed before production. Reversal: restore the signature gate + verifyOwner block and the 401 status; remove resolveOwner.
export type WebhookIntakeResult = { readonly status: 204 | 400 | 503 };

export type WebhookOrderReconciler = {
  reconcileWebhookOrder(ownerId: string, providerOrderUuid: string): Promise<
    { readonly kind: "ignored" } | { readonly kind: "processed"; readonly localOrderId: string }
  >;
};

export type WebhookIntakeDependencies = {
  // BETA(M-5.1): never called during beta (zero secret loads, zero decryption, zero HMAC). Kept optional so the
  // webhook-runtime wiring and the webhook-signature reversal target keep compiling unchanged.
  readonly loadCandidates?: () => Promise<readonly WebhookSecretCandidate[]>;
  readonly deliveryStore: WebhookDeliveryStore;
  readonly orderReconciler: WebhookOrderReconciler;
  // BETA(M-5.1): owner attribution without HMAC — resolves the owner of the globally unique
  // provider_order.providerOrderUuid; null means the order is unknown locally. Removed on reversal.
  readonly resolveOwner: (providerOrderUuid: string) => Promise<string | null>;
  readonly now?: () => Date;
  readonly parseEnvelope?: (rawBody: Buffer, delivery: string | null, event: string | null) => NauttWebhookEnvelope | null;
  readonly parseRejectedIdentity?: (rawBody: Buffer, delivery: string | null, event: string | null) => RejectedWebhookIdentity | null;
  // BETA(M-5.1): never called during beta; kept only so injected doubles and the reversal wiring keep compiling.
  readonly verifyOwner?: (rawBody: Buffer, signature: string | null, candidates: readonly WebhookSecretCandidate[]) => string | null;
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
    // BETA(M-5.1): the signature gate is skipped entirely — missing, malformed, and present-but-invalid
    // X-Nautt-Signature values are all accepted. The body is parsed before any trust decision; the 256 KiB
    // bound in the route caps unauthenticated parse cost, and no state changes without a resolvable owner.
    const payloadDigest = createHash("sha256").update(input.rawBody).digest("hex");
    const envelope = parseEnvelope(input.rawBody, input.delivery, input.event);
    if (!envelope) {
      const rejected = parseRejectedIdentity(input.rawBody, input.delivery, input.event);
      if (rejected) {
        let rejectedOwnerId: string | null;
        try {
          rejectedOwnerId = await dependencies.resolveOwner(rejected.providerOrderUuid);
        } catch {
          return { status: 503 };
        }
        // BETA(M-5.1): an unresolvable owner cannot record evidence (webhook_delivery.owner_id is NOT NULL),
        // so the malformed delivery is refused without a claim row.
        if (rejectedOwnerId === null) return { status: 400 };
        const rejectedAt = now();
        try {
          const rejectedClaim = await dependencies.deliveryStore.claim({
            deliveryUuid: rejected.deliveryUuid,
            providerOrderUuid: rejected.providerOrderUuid,
            eventType: rejected.eventType,
            providerCreatedAt: rejected.createdAt,
            providerAttemptNumber: null,
            ownerId: rejectedOwnerId,
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
      return { status: 400 };
    }
    let ownerId: string | null;
    try {
      ownerId = await dependencies.resolveOwner(envelope.providerOrderUuid);
    } catch {
      return { status: 503 };
    }
    // BETA(M-5.1): an unknown provider order UUID is acknowledged without evidence (no claim row possible);
    // replay re-runs only this local lookup and performs zero provider GETs.
    if (ownerId === null) return { status: 204 };
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
    if (claim.kind === "conflict") return { status: 400 };
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

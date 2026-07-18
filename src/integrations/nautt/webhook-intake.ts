import "server-only";

import { createHash } from "node:crypto";

import {
  parseRejectedWebhookIdentity,
  parseWebhookEnvelope,
  type NauttWebhookEnvelope,
  type RejectedWebhookIdentity,
} from "./webhook-envelope";
import type { WebhookDeliveryStore } from "./webhook-delivery-store";
import { parseWebhookSignature, verifyWebhookOwner, type WebhookSecretCandidate } from "./webhook-signature";

const PROCESSING_LEASE_MS = 14_000;

export type WebhookIntakeResult = { readonly status: 204 | 400 | 401 | 503 };

export type WebhookOrderReconciler = {
  reconcileWebhookOrder(ownerId: string, providerOrderUuid: string): Promise<
    { readonly kind: "ignored" } | { readonly kind: "processed"; readonly localOrderId: string }
  >;
};

export type WebhookIntakeDependencies = {
  readonly loadCandidates: () => Promise<readonly WebhookSecretCandidate[]>;
  readonly deliveryStore: WebhookDeliveryStore;
  readonly orderReconciler: WebhookOrderReconciler;
  readonly now?: () => Date;
  readonly parseEnvelope?: (rawBody: Buffer, delivery: string | null, event: string | null) => NauttWebhookEnvelope | null;
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
    if (!parseWebhookSignature(input.signature)) return { status: 401 };

    let candidates: readonly WebhookSecretCandidate[];
    try {
      candidates = await dependencies.loadCandidates();
    } catch {
      return { status: 503 };
    }
    const ownerId = verifyWebhookOwner(input.rawBody, input.signature, candidates);
    candidates = [];
    if (!ownerId) return { status: 401 };

    const payloadDigest = createHash("sha256").update(input.rawBody).digest("hex");
    const envelope = parseEnvelope(input.rawBody, input.delivery, input.event);
    if (!envelope) {
      const rejected = parseRejectedIdentity(input.rawBody, input.delivery, input.event);
      if (rejected) {
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
            leaseExpiresAt: new Date(rejectedAt.getTime() + PROCESSING_LEASE_MS),
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
        leaseExpiresAt: new Date(acceptedAt.getTime() + PROCESSING_LEASE_MS),
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

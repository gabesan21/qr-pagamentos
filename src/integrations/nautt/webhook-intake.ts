import "server-only";

import { createHash } from "node:crypto";

import {
  parseWebhookNotification,
  type WebhookEnvelopeRejectionReason,
} from "./webhook-envelope";
import type { WebhookDeliveryStore } from "./webhook-delivery-store";
import { logWebhookRejection } from "../../observability/webhook-rejection-log";
import { parseWebhookSignature, verifyWebhookSignature } from "./webhook-signature";

export const WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS = 14_500;
export const WEBHOOK_LEASE_SAFETY_MARGIN_MS = 1_500;
export const WEBHOOK_PROCESSING_LEASE_MS = WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS + WEBHOOK_LEASE_SAFETY_MARGIN_MS;

export type WebhookIntakeResult = { readonly status: 204 | 400 | 401 | 503 };

export type WebhookOrderReconciler = {
  reconcileWebhookOrder(ownerId: string, providerOrderUuid: string): Promise<
    { readonly kind: "ignored" } | { readonly kind: "processed"; readonly localOrderId: string }
  >;
  repairWebhookSettlement(ownerId: string, providerOrderUuid: string): Promise<
    { readonly kind: "ignored" } | { readonly kind: "processed"; readonly localOrderId: string }
  >;
};

export type WebhookIntakeDependencies = {
  readonly resolveOrderOwner: (providerOrderUuid: string) => Promise<string | null>;
  readonly loadOwnerWebhookSecret: (ownerId: string) => Promise<Buffer | null>;
  readonly deliveryStore: WebhookDeliveryStore;
  readonly orderReconciler: WebhookOrderReconciler;
  readonly now?: () => Date;
};
export function createWebhookIntake(dependencies: WebhookIntakeDependencies) {
  const now = dependencies.now ?? (() => new Date());
  return async function intake(input: {
    readonly rawBody: Buffer;
    readonly signature: string | null;
  }): Promise<WebhookIntakeResult> {
    let rejectionReason: WebhookEnvelopeRejectionReason = "schema_invalid";
    const notification = parseWebhookNotification(input.rawBody, (reason) => {
      rejectionReason = reason;
    });
    if (!notification) {
      logWebhookRejection(rejectionReason, null, null);
      return { status: 400 };
    }

    let ownerId: string | null;
    try {
      ownerId = await dependencies.resolveOrderOwner(notification.providerOrderUuid);
    } catch {
      return { status: 503 };
    }
    // Unknown provider orders cannot select a merchant or trigger provider requests.
    if (!ownerId) return { status: 204 };

    const deliveryUuid = notification.envelope?.deliveryUuid ?? null;
    const eventType = notification.envelope?.eventType ?? null;
    if (input.signature === null) {
      logWebhookRejection("missing", deliveryUuid, eventType);
      return { status: 401 };
    }
    if (!parseWebhookSignature(input.signature)) {
      logWebhookRejection("malformed", deliveryUuid, eventType);
      return { status: 401 };
    }
    let authenticated: boolean;
    try {
      const secret = await dependencies.loadOwnerWebhookSecret(ownerId);
      authenticated = secret !== null && verifyWebhookSignature(input.rawBody, input.signature, secret);
    } catch {
      return { status: 503 };
    }
    if (!authenticated) {
      logWebhookRejection("unmatched", deliveryUuid, eventType);
      return { status: 401 };
    }
    const envelope = notification.envelope;
    if (!envelope) {
      try {
        await dependencies.orderReconciler.reconcileWebhookOrder(ownerId, notification.providerOrderUuid);
        return { status: 204 };
      } catch {
        return { status: 503 };
      }
    }

    const payloadDigest = createHash("sha256").update(input.rawBody).digest("hex");
    const acceptedAt = now();
    let claim;
    try {
      claim = await dependencies.deliveryStore.claim({
        deliveryUuid: envelope.deliveryUuid,
        ownerId,
        providerOrderUuid: notification.providerOrderUuid,
        eventType: envelope.eventType,
        providerCreatedAt: envelope.createdAt,
        providerAttemptNumber: null,
        payloadDigest,
        now: acceptedAt,
        leaseExpiresAt: new Date(acceptedAt.getTime() + WEBHOOK_PROCESSING_LEASE_MS),
      });
    } catch {
      return { status: 503 };
    }

    if (claim.kind === "busy") return { status: 503 };
    if (claim.kind === "conflict") {
      try {
        await dependencies.orderReconciler.reconcileWebhookOrder(ownerId, notification.providerOrderUuid);
        return { status: 204 };
      } catch {
        return { status: 503 };
      }
    }

    if (claim.kind === "terminal") {
      try {
        await dependencies.orderReconciler.repairWebhookSettlement(ownerId, notification.providerOrderUuid);
        return { status: 204 };
      } catch {
        return { status: 503 };
      }
    }

    try {
      const reconciled = await dependencies.orderReconciler.reconcileWebhookOrder(ownerId, notification.providerOrderUuid);
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

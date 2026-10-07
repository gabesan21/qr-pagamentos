import "server-only";

import { isUuid } from "./decimal";

export const NAUTT_WEBHOOK_EVENTS = [
  "order.created",
  "order.paid",
  "order.processing",
  "order.completed",
  "order.rejected",
  "order.canceled",
  "order.refunded",
  "order.expired",
  "order.failed",
] as const;
export type NauttWebhookEvent = (typeof NAUTT_WEBHOOK_EVENTS)[number];

export type NauttWebhookEnvelope = {
  readonly deliveryUuid: string;
  readonly eventType: NauttWebhookEvent;
  readonly createdAt: Date;
};

export type NauttWebhookNotification = {
  readonly providerOrderUuid: string;
  readonly envelope: NauttWebhookEnvelope | null;
};

export type WebhookEnvelopeRejectionReason =
  | "invalid_utf8"
  | "invalid_json"
  | "schema_invalid";
function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseWebhookNotification(
  rawBody: Buffer,
  onRejected?: (reason: WebhookEnvelopeRejectionReason) => void,
): NauttWebhookNotification | null {
  const reject = (reason: WebhookEnvelopeRejectionReason): null => {
    onRejected?.(reason);
    return null;
  };
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    return reject("invalid_utf8");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(decoded);
  } catch {
    return reject("invalid_json");
  }
  const topLevel = record(payload);
  const data = record(topLevel?.data);
  if (!topLevel || !data || typeof data.uuid !== "string" || !isUuid(data.uuid)) {
    return reject("schema_invalid");
  }

  const providerOrderUuid = data.uuid.toLowerCase();
  let envelope: NauttWebhookEnvelope | null = null;
  if (
    typeof topLevel.id === "string" &&
    isUuid(topLevel.id) &&
    typeof topLevel.event === "string" &&
    (NAUTT_WEBHOOK_EVENTS as readonly string[]).includes(topLevel.event)
  ) {
    const createdAt = parseDate(topLevel.created_at);
    if (createdAt) {
      envelope = {
        deliveryUuid: topLevel.id.toLowerCase(),
        eventType: topLevel.event as NauttWebhookEvent,
        createdAt,
      };
    }
  }

  return {
    providerOrderUuid,
    envelope,
  };
}


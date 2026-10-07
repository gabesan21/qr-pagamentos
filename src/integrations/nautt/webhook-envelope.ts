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
  readonly providerOrderUuid: string;
  readonly providerAttemptNumber: number | null;
};

export type RejectedWebhookIdentity = Omit<NauttWebhookEnvelope, "providerAttemptNumber">;

export type WebhookEnvelopeRejectionReason =
  | "invalid_utf8"
  | "invalid_json"
  | "schema_invalid"
  | "delivery_header_invalid"
  | "delivery_header_mismatch"
  | "event_header_invalid"
  | "event_header_mismatch"
  | "created_at_invalid"
  | "webhook_deliveries_invalid"
  | "attempt_number_invalid"
  | "attempt_identity_mismatch";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseJson(rawBody: Buffer): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBody));
}

export function parseWebhookEnvelope(
  rawBody: Buffer,
  deliveryHeader: string | null,
  eventHeader: string | null,
  onRejected?: (reason: WebhookEnvelopeRejectionReason) => void,
): NauttWebhookEnvelope | null {
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
  const envelope = record(payload);
  const data = record(envelope?.data);
  if (!envelope || !data || !isUuid(envelope.id) || typeof envelope.event !== "string" || !(NAUTT_WEBHOOK_EVENTS as readonly string[]).includes(envelope.event) || !isUuid(data.uuid)) return reject("schema_invalid");
  if (deliveryHeader !== null && deliveryHeader !== envelope.id) {
    return reject(isUuid(deliveryHeader) ? "delivery_header_mismatch" : "delivery_header_invalid");
  }
  if (eventHeader !== null && eventHeader !== envelope.event) {
    return reject((NAUTT_WEBHOOK_EVENTS as readonly string[]).includes(eventHeader) ? "event_header_mismatch" : "event_header_invalid");
  }
  const createdAt = parseDate(envelope.created_at);
  if (!createdAt) return reject("created_at_invalid");
  let providerAttemptNumber: number | null = null;
  if (data.webhook_deliveries !== undefined) {
    if (!Array.isArray(data.webhook_deliveries)) return reject("webhook_deliveries_invalid");
    const matching = data.webhook_deliveries
      .map(record)
      .filter((item): item is Record<string, unknown> => item !== null)
      .find((item) => item.uuid === envelope.id);
    if (matching) {
      if (!Number.isSafeInteger(matching.attempt_number) || (matching.attempt_number as number) <= 0) return reject("attempt_number_invalid");
      if (matching.order_uuid !== data.uuid || matching.event_type !== envelope.event) return reject("attempt_identity_mismatch");
      providerAttemptNumber = matching.attempt_number as number;
    }
  }
  return {
    deliveryUuid: envelope.id,
    eventType: envelope.event as NauttWebhookEvent,
    createdAt,
    providerOrderUuid: data.uuid,
    providerAttemptNumber,
  };
}

export function parseRejectedWebhookIdentity(rawBody: Buffer, deliveryHeader: string | null, eventHeader: string | null): RejectedWebhookIdentity | null {
  let payload: unknown;
  try {
    payload = parseJson(rawBody);
  } catch {
    return null;
  }
  const envelope = record(payload);
  const data = record(envelope?.data);
  const createdAt = parseDate(envelope?.created_at);
  // Valid duplicate headers retain the existing rejection identity; absent ones
  // use authenticated body metadata, never an invalid present header.
  const deliveryUuid = deliveryHeader ?? envelope?.id;
  const eventType = eventHeader ?? envelope?.event;
  if (!isUuid(deliveryUuid) || typeof eventType !== "string" || !(NAUTT_WEBHOOK_EVENTS as readonly string[]).includes(eventType)) return null;
  if (!data || !isUuid(data.uuid) || !createdAt) return null;
  return {
    deliveryUuid,
    eventType: eventType as NauttWebhookEvent,
    createdAt,
    providerOrderUuid: data.uuid,
  };
}

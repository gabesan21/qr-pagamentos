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

export function parseWebhookEnvelope(rawBody: Buffer, deliveryHeader: string | null, eventHeader: string | null): NauttWebhookEnvelope | null {
  if (!deliveryHeader || !isUuid(deliveryHeader) || !eventHeader || !(NAUTT_WEBHOOK_EVENTS as readonly string[]).includes(eventHeader)) return null;
  let payload: unknown;
  try {
    payload = parseJson(rawBody);
  } catch {
    return null;
  }
  const envelope = record(payload);
  const data = record(envelope?.data);
  if (!envelope || !data || envelope.id !== deliveryHeader || envelope.event !== eventHeader || !isUuid(data.uuid)) return null;
  const createdAt = parseDate(envelope.created_at);
  if (!createdAt) return null;
  let providerAttemptNumber: number | null = null;
  if (data.webhook_deliveries !== undefined) {
    if (!Array.isArray(data.webhook_deliveries)) return null;
    const matching = data.webhook_deliveries
      .map(record)
      .filter((item): item is Record<string, unknown> => item !== null)
      .find((item) => item.uuid === deliveryHeader);
    if (matching) {
      if (!Number.isSafeInteger(matching.attempt_number) || (matching.attempt_number as number) <= 0) return null;
      if (matching.order_uuid !== data.uuid || matching.event_type !== eventHeader) return null;
      providerAttemptNumber = matching.attempt_number as number;
    }
  }
  return {
    deliveryUuid: deliveryHeader,
    eventType: eventHeader as NauttWebhookEvent,
    createdAt,
    providerOrderUuid: data.uuid,
    providerAttemptNumber,
  };
}

export function parseRejectedWebhookIdentity(rawBody: Buffer, deliveryHeader: string | null, eventHeader: string | null): RejectedWebhookIdentity | null {
  if (!deliveryHeader || !isUuid(deliveryHeader) || !eventHeader || !(NAUTT_WEBHOOK_EVENTS as readonly string[]).includes(eventHeader)) return null;
  let payload: unknown;
  try {
    payload = parseJson(rawBody);
  } catch {
    return null;
  }
  const envelope = record(payload);
  const data = record(envelope?.data);
  const createdAt = parseDate(envelope?.created_at);
  if (!data || !isUuid(data.uuid) || !createdAt) return null;
  return {
    deliveryUuid: deliveryHeader,
    eventType: eventHeader as NauttWebhookEvent,
    createdAt,
    providerOrderUuid: data.uuid,
  };
}

import "server-only";

import { isUuid } from "./decimal";
import { NAUTT_WEBHOOK_EVENTS, type NauttWebhookEvent } from "./webhook-envelope";

export type NormalizedWebhookDelivery = {
  readonly deliveryUuid: string;
  readonly webhookUuid: string;
  readonly orderUuid: string;
  readonly eventType: NauttWebhookEvent;
  readonly isDelivered: boolean;
  readonly isPermanentlyFailed: boolean;
  readonly attemptNumber: number;
  readonly createdAt: Date;
};

/**
 * A server-side normalized boundary. Its implementation owns provider transport
 * decoding; this contract deliberately makes no assertion about an HTTP response
 * status, envelope, list wrapper, or pagination behavior.
 */
export interface WebhookDeliveryHistoryPort {
  listOrderDeliveries(apiKey: string, orderUuid: string, signal: AbortSignal): Promise<unknown>;
  getDelivery(apiKey: string, deliveryUuid: string, signal: AbortSignal): Promise<unknown>;
}

const NORMALIZED_KEYS = [
  "deliveryUuid",
  "webhookUuid",
  "orderUuid",
  "eventType",
  "isDelivered",
  "isPermanentlyFailed",
  "attemptNumber",
  "createdAt",
] as const;

export function normalizeWebhookDelivery(value: unknown): NormalizedWebhookDelivery | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== NORMALIZED_KEYS.length || keys.some((key) => !(NORMALIZED_KEYS as readonly string[]).includes(key))) return null;
  if (
    !isUuid(record.deliveryUuid) ||
    !isUuid(record.webhookUuid) ||
    !isUuid(record.orderUuid) ||
    typeof record.eventType !== "string" ||
    !(NAUTT_WEBHOOK_EVENTS as readonly string[]).includes(record.eventType) ||
    typeof record.isDelivered !== "boolean" ||
    typeof record.isPermanentlyFailed !== "boolean" ||
    !Number.isSafeInteger(record.attemptNumber) ||
    (record.attemptNumber as number) <= 0 ||
    !(record.createdAt instanceof Date) ||
    Number.isNaN(record.createdAt.getTime())
  ) return null;
  return record as NormalizedWebhookDelivery;
}

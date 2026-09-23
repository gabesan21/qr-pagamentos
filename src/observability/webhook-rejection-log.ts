import "server-only";

import { isUuid } from "../integrations/nautt/decimal";
import { NAUTT_WEBHOOK_EVENTS } from "../integrations/nautt/webhook-envelope";

// Redacted webhook-rejection writer: reuses the discipline of
// provider-failure-log.ts (server-only, one JSON line, console sink,
// swallow-on-failure, never alters the response). The record membership is
// closed by the type below: event, reason, status, delivery, and eventType.
// `delivery` and `eventType` come from headers that are attacker-controlled
// before authentication, so each is logged verbatim only when it already
// satisfies its own closed shape (a UUID; one of NAUTT_WEBHOOK_EVENTS) —
// otherwise the fixed unknown marker is logged instead. The raw body, the
// signature value, the webhook secret, the encryption key, the API key, and
// the resolved owner id are never reachable members of this record.

export type WebhookRejectionReason = "missing" | "malformed" | "unmatched";

const UNKNOWN_MARKER = "unknown";

type WebhookRejectionRecord = Readonly<{
  timestamp: string;
  level: "warn";
  event: "webhook.rejected";
  reason: WebhookRejectionReason;
  status: 401;
  delivery: string;
  eventType: string;
}>;

/**
 * Logs one redacted webhook-rejection record for a missing, malformed, or
 * unmatched `X-Nautt-Signature`. `delivery` and `eventType` are the raw
 * `X-Nautt-Delivery`/`X-Nautt-Event` header values, validated here — never
 * trusted verbatim, since authentication has not happened yet.
 */
export function logWebhookRejection(
  reason: WebhookRejectionReason,
  delivery: string | null,
  eventType: string | null,
): void {
  try {
    const record: WebhookRejectionRecord = {
      timestamp: new Date().toISOString(),
      level: "warn",
      event: "webhook.rejected",
      reason,
      status: 401,
      delivery: isUuid(delivery) ? delivery : UNKNOWN_MARKER,
      eventType: eventType && (NAUTT_WEBHOOK_EVENTS as readonly string[]).includes(eventType) ? eventType : UNKNOWN_MARKER,
    };
    console.warn(JSON.stringify(record));
  } catch {
    // Logging cannot alter a response or a rejection decision.
  }
}

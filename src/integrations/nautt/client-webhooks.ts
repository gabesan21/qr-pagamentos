import "server-only";

import { loadNauttApiBaseUrl } from "./config";

const DEFAULT_TIMEOUT_MS = 10_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const NAUTT_WEBHOOK_EVENT_TYPES = [
  "order.created",
  "order.paid",
  "order.processing",
  "order.completed",
  "order.failed",
  "order.expired",
  "order.rejected",
  "order.refunded",
  "order.canceled",
] as const;

export class NauttWebhookAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NauttWebhookAdapterError";
  }
}

export type RegisteredNauttWebhook = {
  providerWebhookId: string;
  secret: string;
  registeredAt: Date;
};

type AdapterDependencies = {
  fetch?: typeof globalThis.fetch;
  createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
  serialize?: (value: unknown) => string;
};

export function validateNauttWebhookCallbackUrl(candidate: string): string {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new NauttWebhookAdapterError("Nautt webhook registration failed");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new NauttWebhookAdapterError("Nautt webhook registration failed");
  }
  return url.toString();
}

function hasExactEvents(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== NAUTT_WEBHOOK_EVENT_TYPES.length) return false;
  const actual = new Set(value);
  return actual.size === value.length && NAUTT_WEBHOOK_EVENT_TYPES.every((event) => actual.has(event));
}

function parseSuccess(payload: unknown, callbackUrl: string): RegisteredNauttWebhook {
  if (typeof payload !== "object" || payload === null || !("data" in payload) || ("success" in payload && payload.success !== true)) {
    throw new NauttWebhookAdapterError("Nautt webhook registration failed");
  }
  const data = payload.data;
  if (typeof data !== "object" || data === null) throw new NauttWebhookAdapterError("Nautt webhook registration failed");
  const record = data as Record<string, unknown>;
  const registeredAt = typeof record.created_at === "string" ? new Date(record.created_at) : new Date(Number.NaN);
  if (
    typeof record.uuid !== "string" ||
    !UUID_PATTERN.test(record.uuid) ||
    typeof record.secret !== "string" ||
    !record.secret.trim() ||
    record.url !== callbackUrl ||
    record.is_active !== true ||
    !hasExactEvents(record.event_types) ||
    Number.isNaN(registeredAt.getTime())
  ) {
    throw new NauttWebhookAdapterError("Nautt webhook registration failed");
  }
  return { providerWebhookId: record.uuid, secret: record.secret, registeredAt };
}

export function createClientWebhooksAdapter(dependencies: AdapterDependencies = {}) {
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const createTimeoutSignal = dependencies.createTimeoutSignal ?? AbortSignal.timeout;
  const serialize = dependencies.serialize ?? JSON.stringify;

  return {
    async register(input: { apiKey: string; callbackUrl: string }): Promise<RegisteredNauttWebhook> {
      const apiKey = input.apiKey.trim();
      if (!apiKey) throw new NauttWebhookAdapterError("Nautt webhook registration failed");
      const callbackUrl = validateNauttWebhookCallbackUrl(input.callbackUrl);
      let body: string;
      try {
        body = serialize({ url: callbackUrl, event_types: [...NAUTT_WEBHOOK_EVENT_TYPES] });
      } catch {
        throw new NauttWebhookAdapterError("Nautt webhook registration failed");
      }

      try {
        const response = await fetch(`${loadNauttApiBaseUrl()}/client-webhooks`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          body,
          signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
        });
        if (response.status !== 201) throw new NauttWebhookAdapterError("Nautt webhook registration failed");
        return parseSuccess(await response.json(), callbackUrl);
      } catch {
        throw new NauttWebhookAdapterError("Nautt webhook registration failed");
      }
    },
  };
}

export function getClientWebhooksAdapter() {
  return createClientWebhooksAdapter();
}

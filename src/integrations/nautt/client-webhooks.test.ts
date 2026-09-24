import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createClientWebhooksAdapter,
  NAUTT_WEBHOOK_EVENT_TYPES,
  NauttWebhookAdapterError,
  validateNauttWebhookCallbackUrl,
} from "./client-webhooks";

const callbackUrl = "https://payments.example.com/api/nautt/webhooks";
const apiKey = "owner-api-key";
const providerWebhookId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const secret = "nautt_whsec_one-time-secret";

function success(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      success: true,
      data: {
        uuid: providerWebhookId,
        url: callbackUrl,
        secret,
        event_types: [...NAUTT_WEBHOOK_EVENT_TYPES],
        is_active: true,
        created_at: "2026-07-17T20:00:00Z",
        ...overrides,
      },
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

describe("Nautt client webhooks adapter", () => {
  it("dispatches one exact production request and returns the internal complete tuple", async () => {
    const fetch = vi.fn(async () => success());
    const timeoutSignal = new AbortController().signal;
    const createTimeoutSignal = vi.fn(() => timeoutSignal);
    const adapter = createClientWebhooksAdapter({ fetch, createTimeoutSignal });

    const result = await adapter.register({ apiKey, callbackUrl });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.nauttfinance.com/api/v2/client-webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ url: callbackUrl, event_types: [...NAUTT_WEBHOOK_EVENT_TYPES] }),
      signal: timeoutSignal,
    });
    expect(createTimeoutSignal).toHaveBeenCalledWith(10_000);
    expect(result).toEqual({ providerWebhookId, secret, registeredAt: new Date("2026-07-17T20:00:00Z") });
  });

  it.each([
    ["not a URL", apiKey],
    ["http://payments.example.com/webhook", apiKey],
    ["https://user:pass@payments.example.com/webhook", apiKey],
    ["https://payments.example.com/webhook#fragment", apiKey],
    [callbackUrl, "   "],
  ])("rejects invalid local input before dispatch", async (url, key) => {
    const fetch = vi.fn();
    const adapter = createClientWebhooksAdapter({ fetch });
    await expect(adapter.register({ apiKey: key, callbackUrl: url })).rejects.toBeInstanceOf(NauttWebhookAdapterError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects local serialization failure before dispatch without leaking input", async () => {
    const fetch = vi.fn();
    const adapter = createClientWebhooksAdapter({
      fetch,
      serialize: () => {
        throw new Error(`could not serialize ${apiKey}`);
      },
    });
    const error = await adapter.register({ apiKey, callbackUrl }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NauttWebhookAdapterError);
    expect(String(error)).not.toContain(apiKey);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["missing uuid", { uuid: undefined }],
    ["missing secret", { secret: "" }],
    ["inactive", { is_active: false }],
    ["callback mismatch", { url: "https://other.example.com/webhook" }],
    ["event mismatch", { event_types: NAUTT_WEBHOOK_EVENT_TYPES.slice(1) }],
    ["duplicate event", { event_types: [...NAUTT_WEBHOOK_EVENT_TYPES, NAUTT_WEBHOOK_EVENT_TYPES[0]] }],
    ["invalid timestamp", { created_at: "not-a-date" }],
  ])("rejects an unusable 201: %s", async (_label, overrides) => {
    const adapter = createClientWebhooksAdapter({ fetch: vi.fn(async () => success(overrides)) });
    const error = await adapter.register({ apiKey, callbackUrl }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NauttWebhookAdapterError);
    expect(JSON.stringify(error)).not.toContain(apiKey);
    expect(JSON.stringify(error)).not.toContain(secret);
  });

  it("accepts the observed 2026-07-20 production envelope without a success field", async () => {
    // Fixture mirrors the 2026-07-20 production envelope with redacted/fabricated values.
    const productionCallbackUrl = "https://example.com/webhooks/nautt";
    const productionSecret = "nautt_whsec_TEST_ONLY_not_a_real_secret_0000000000";
    const productionUuid = "00000000-0000-4000-8000-000000000000";
    const productionBody = {
      message: "Missing translation: order.webhook_created",
      data: {
        created_at: "2026-07-20T19:09:15.962135Z",
        event_types: [...NAUTT_WEBHOOK_EVENT_TYPES],
        is_active: true,
        secret: productionSecret,
        url: productionCallbackUrl,
        uuid: productionUuid,
      },
      code: "order.webhook_created",
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify(productionBody), { status: 201 }));
    const adapter = createClientWebhooksAdapter({ fetch });

    const result = await adapter.register({ apiKey, callbackUrl: productionCallbackUrl });

    expect(result).toEqual({
      providerWebhookId: productionUuid,
      secret: productionSecret,
      registeredAt: new Date("2026-07-20T19:09:15.962135Z"),
    });
  });

  it.each([["explicit false", false], ["string", "true"], ["number", 1], ["null", null]])(
    "rejects a 201 with a present non-true success value: %s",
    async (_label, successValue) => {
      const body = JSON.parse(await success().text()) as Record<string, unknown>;
      const fetch = vi.fn(async () => new Response(JSON.stringify({ ...body, success: successValue }), { status: 201 }));
      const adapter = createClientWebhooksAdapter({ fetch });
      const error = await adapter.register({ apiKey, callbackUrl }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(NauttWebhookAdapterError);
      expect(JSON.stringify(error)).not.toContain(secret);
    },
  );

  it.each([401, 403, 404, 422, 429, 500, 599])("redacts non-201 response %s", async (status) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ secret, apiKey }), { status }));
    const adapter = createClientWebhooksAdapter({ fetch });
    const error = await adapter.register({ apiKey, callbackUrl }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NauttWebhookAdapterError);
    expect(String(error)).toBe("NauttWebhookAdapterError: Nautt webhook registration failed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([new Error(`transport ${apiKey}`), new DOMException("timed out", "TimeoutError"), new DOMException("aborted", "AbortError")])(
    "redacts transport, timeout, and abort failures",
    async (failure) => {
      const adapter = createClientWebhooksAdapter({ fetch: vi.fn(async () => Promise.reject(failure)) });
      const error = await adapter.register({ apiKey, callbackUrl }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(NauttWebhookAdapterError);
      expect(String(error)).not.toContain(apiKey);
    },
  );
});

describe("validateNauttWebhookCallbackUrl", () => {
  const saved: { ALLOW_LOOPBACK_OPERATOR_ORIGINS: string | undefined } = {
    ALLOW_LOOPBACK_OPERATOR_ORIGINS: undefined,
  };

  beforeEach(() => {
    saved.ALLOW_LOOPBACK_OPERATOR_ORIGINS = process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (saved.ALLOW_LOOPBACK_OPERATOR_ORIGINS === undefined) delete process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
    else process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS = saved.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
  });

  it("accepts a loopback HTTP callback outside production", () => {
    vi.stubEnv("NODE_ENV", undefined);
    expect(validateNauttWebhookCallbackUrl("http://localhost:3000/api/nautt/webhooks")).toBe(
      "http://localhost:3000/api/nautt/webhooks",
    );
  });

  it("refuses a loopback HTTP callback in production without the allowance", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
    expect(() => validateNauttWebhookCallbackUrl("http://localhost:3000/api/nautt/webhooks")).toThrow(
      NauttWebhookAdapterError,
    );
  });

  it("accepts a loopback HTTP callback in production with the allowance set to exactly 1", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS = "1";
    expect(validateNauttWebhookCallbackUrl("http://localhost:3000/api/nautt/webhooks")).toBe(
      "http://localhost:3000/api/nautt/webhooks",
    );
  });

  it.each(["true", "0", "", "   "])("treats allowance value %j as absent in production", (value) => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS = value;
    expect(() => validateNauttWebhookCallbackUrl("http://localhost:3000/api/nautt/webhooks")).toThrow(
      NauttWebhookAdapterError,
    );
  });

  it("keeps a non-loopback HTTPS callback unaffected by production and the allowance", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ALLOW_LOOPBACK_OPERATOR_ORIGINS;
    expect(validateNauttWebhookCallbackUrl(callbackUrl)).toBe(callbackUrl);
  });
});

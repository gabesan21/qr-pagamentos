import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPricingOrdersAdapter,
  NauttOrderCreationIndeterminateError,
  NauttOrderNotFoundError,
  NauttOrderReadAdapterError,
  NauttOrderValidationError,
  NauttPricingAdapterError,
} from "./pricing-orders-client";

const apiKey = "ntt_owner-secret-key";
const currencyUuid = "550e8400-e29b-41d4-a716-446655440000";
const exchangeCurrencyUuid = "770e8400-e29b-41d4-a716-446655440002";
const quoteUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const orderUuid = "990e8400-e29b-41d4-a716-446655440004";

function quoteSuccess(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      message: "Buy conversion calculated successfully",
      code: "system.buy_conversion_calculated",
      data: {
        amount: "500.00",
        final_amount: "97.50",
        client_amount: "95.00",
        profit: "1.46",
        exchange_fee: "1.00",
        min_withdrawal: "50.00",
        withdrawal_delay_minutes: 30,
        base_price: "5.00",
        price: "5.205",
        quote_uuid: quoteUuid,
        ...overrides,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("Nautt pricing adapter", () => {
  it("sends the exact fiat quote request and returns strict redacted fields with a five-minute injected-clock expiry", async () => {
    const fetch = vi.fn(async () => quoteSuccess());
    const timeoutSignal = new AbortController().signal;
    const createTimeoutSignal = vi.fn(() => timeoutSignal);
    const now = vi.fn(() => new Date("2026-07-17T20:00:00.000Z"));
    const adapter = createPricingOrdersAdapter({ fetch, createTimeoutSignal, now });

    const result = await adapter.createQuote({
      apiKey,
      currencyUuid,
      exchangeCurrencyUuid,
      amount: { kind: "fiat", value: "500.00" },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.nauttfinance.com/api/v2/pricing/panel/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        currency_uuid: currencyUuid,
        exchange_currency_uuid: exchangeCurrencyUuid,
        amount: "500.00",
      }),
      signal: timeoutSignal,
    });
    expect(createTimeoutSignal).toHaveBeenCalledWith(10_000);
    expect(now).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      quoteUuid,
      amount: "500.00",
      finalAmount: "97.50",
      clientAmount: "95.00",
      profit: "1.46",
      exchangeFee: "1.00",
      minWithdrawal: "50.00",
      withdrawalDelayMinutes: 30,
      basePrice: "5.00",
      price: "5.205",
      expiresAt: new Date("2026-07-17T20:05:00.000Z"),
    });
    expect(JSON.stringify(result)).not.toContain(apiKey);
  });

  it("sends amount_usd and never amount for a usdt quote while preserving the string byte-for-byte", async () => {
    const fetch = vi.fn(async () => quoteSuccess({ amount: "20.00" }));
    const adapter = createPricingOrdersAdapter({ fetch });

    const result = await adapter.createQuote({
      apiKey,
      currencyUuid,
      exchangeCurrencyUuid,
      amount: { kind: "usdt", value: "20.00" },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe(
      JSON.stringify({
        currency_uuid: currencyUuid,
        exchange_currency_uuid: exchangeCurrencyUuid,
        amount_usd: "20.00",
      }),
    );
    expect(result.amount).toBe("20.00");
  });

  it.each([
    ["bad currency uuid", { currencyUuid: "not-a-uuid" }],
    ["bad exchange uuid", { exchangeCurrencyUuid: "" }],
    ["signed amount", { amount: { kind: "fiat", value: "-1.00" } }],
    ["exponent amount", { amount: { kind: "usdt", value: "1e3" } }],
    ["whitespace amount", { amount: { kind: "fiat", value: " 500.00" } }],
    ["zero amount", { amount: { kind: "fiat", value: "0.00" } }],
    ["non-string amount", { amount: { kind: "fiat", value: 500 } }],
    ["blank api key", { apiKey: "   " }],
  ])("rejects invalid local input before decryption-stage dispatch: %s", async (_label, override) => {
    const fetch = vi.fn();
    const adapter = createPricingOrdersAdapter({ fetch });
    const input = {
      apiKey,
      currencyUuid,
      exchangeCurrencyUuid,
      amount: { kind: "fiat", value: "500.00" },
      ...override,
    } as Parameters<typeof adapter.createQuote>[0];

    await expect(adapter.createQuote(input)).rejects.toBeInstanceOf(NauttPricingAdapterError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["missing quote uuid", { quote_uuid: undefined }],
    ["malformed quote uuid", { quote_uuid: "not-a-uuid" }],
    ["numeric monetary", { final_amount: 97.5 }],
    ["exponent monetary", { price: "5.2e0" }],
    ["missing monetary", { client_amount: undefined }],
    ["non-integer delay", { withdrawal_delay_minutes: 30.5 }],
    ["negative delay", { withdrawal_delay_minutes: -1 }],
    ["string delay", { withdrawal_delay_minutes: "30" }],
  ])("rejects a malformed success: %s", async (_label, overrides) => {
    const fetch = vi.fn(async () => quoteSuccess(overrides));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter
      .createQuote({ apiKey, currencyUuid, exchangeCurrencyUuid, amount: { kind: "fiat", value: "500.00" } })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttPricingAdapterError);
    expect(String(error)).not.toContain(apiKey);
    expect(String(error)).not.toContain("quote_uuid");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a success envelope without a data object", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: "ok", code: "x" }), { status: 200 }));
    const adapter = createPricingOrdersAdapter({ fetch });

    await expect(
      adapter.createQuote({ apiKey, currencyUuid, exchangeCurrencyUuid, amount: { kind: "fiat", value: "500.00" } }),
    ).rejects.toBeInstanceOf(NauttPricingAdapterError);
  });

  it.each([400, 401, 403, 404, 422, 429, 500, 599])("redacts non-200 response %s", async (status) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ secret: apiKey, quote_uuid: quoteUuid }), { status }));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter
      .createQuote({ apiKey, currencyUuid, exchangeCurrencyUuid, amount: { kind: "fiat", value: "500.00" } })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttPricingAdapterError);
    expect(String(error)).toBe("NauttPricingAdapterError: Nautt pricing failed");
    expect(JSON.stringify(error)).not.toContain(apiKey);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error(`transport leaked ${apiKey}`),
    new DOMException("timed out", "TimeoutError"),
    new DOMException("aborted", "AbortError"),
  ])("redacts transport, timeout, and abort failures", async (failure) => {
    const adapter = createPricingOrdersAdapter({ fetch: vi.fn(async () => Promise.reject(failure)) });

    const error = await adapter
      .createQuote({ apiKey, currencyUuid, exchangeCurrencyUuid, amount: { kind: "fiat", value: "500.00" } })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttPricingAdapterError);
    expect(String(error)).not.toContain(apiKey);
  });

  it("rejects a non-JSON 200 body without leaking it", async () => {
    const fetch = vi.fn(async () => new Response(`<html>${apiKey}</html>`, { status: 200 }));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter
      .createQuote({ apiKey, currencyUuid, exchangeCurrencyUuid, amount: { kind: "fiat", value: "500.00" } })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttPricingAdapterError);
    expect(String(error)).not.toContain(apiKey);
  });
});

const pixCopyPasteCode = "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const payerName = "Maria Santos";
const payerDocument = "12345678900";
const userEmail = "maria@example.com";

function orderSuccess(paymentData: Record<string, unknown>, overrides: Record<string, unknown> = {}, status = 201) {
  return new Response(
    JSON.stringify({
      message: "Order created successfully",
      code: "order.order_created",
      data: {
        uuid: orderUuid,
        order_type: "deposit",
        description: "PIX deposit for USDT purchase",
        status: "new",
        fiat_amount: "1000.0000",
        crypto_amount: "196.0784",
        nautt_quote: "5.1000",
        expire_at: "2025-01-15T18:30:00+00:00",
        payer: { name: payerName, document_type: "CPF", document: payerDocument },
        payment_data: paymentData,
        user: { uuid: "660e8400-e29b-41d4-a716-446655440001", name: payerName, email: userEmail },
        ...overrides,
      },
    }),
    { status, headers: { "content-type": "application/json" } },
  );
}

function expectRedacted(error: unknown) {
  expect(String(error)).not.toContain(apiKey);
  expect(JSON.stringify(error)).not.toContain(apiKey);
  expect(JSON.stringify(error)).not.toContain(payerName);
  expect(JSON.stringify(error)).not.toContain(payerDocument);
  expect(JSON.stringify(error)).not.toContain(userEmail);
}

describe("Nautt order creation adapter", () => {
  it("dispatches one exact minimal request and normalizes the documented PIX view without PII or raw envelopes", async () => {
    const fetch = vi.fn(async () => orderSuccess({ payment_method: "pix", qrcode: pixCopyPasteCode }));
    const timeoutSignal = new AbortController().signal;
    const createTimeoutSignal = vi.fn(() => timeoutSignal);
    const adapter = createPricingOrdersAdapter({ fetch, createTimeoutSignal });

    const result = await adapter.createOnrampOrder({ apiKey, quoteUuid });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("https://api.nauttfinance.com/api/v2/orders/onramp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ quote_uuid: quoteUuid }),
      signal: timeoutSignal,
    });
    expect(result).toEqual({
      orderUuid,
      status: "new",
      fiatAmount: "1000.0000",
      cryptoAmount: "196.0784",
      nauttQuote: "5.1000",
      expiresAt: new Date("2025-01-15T18:30:00+00:00"),
      paymentMethod: "pix",
      pixCopyPaste: pixCopyPasteCode,
    });
    expect(JSON.stringify(result)).not.toContain(payerName);
    expect(JSON.stringify(result)).not.toContain(payerDocument);
    expect(JSON.stringify(result)).not.toContain(userEmail);
  });

  it("sends only documented optional string fields in an exact body", async () => {
    const fetch = vi.fn(async () => orderSuccess({ payment_method: "pix", qrcode: pixCopyPasteCode }));
    const adapter = createPricingOrdersAdapter({ fetch });
    const posUuid = "bb0e8400-e29b-41d4-a716-446655440006";

    await adapter.createOnrampOrder({
      apiKey,
      quoteUuid,
      depositFields: { first_name: "Gabriel", last_name: "Santos", email: "gabriel@example.com" },
      description: "PIX deposit for USDT purchase",
      posUuid,
      additionalInfos: [
        { key: "customer_id", value: "12345" },
        { key: "reference", value: "ORDER-2025-001" },
      ],
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe(
      JSON.stringify({
        quote_uuid: quoteUuid,
        deposit_fields: { first_name: "Gabriel", last_name: "Santos", email: "gabriel@example.com" },
        description: "PIX deposit for USDT purchase",
        pos_uuid: posUuid,
        additional_infos: [
          { key: "customer_id", value: "12345" },
          { key: "reference", value: "ORDER-2025-001" },
        ],
      }),
    );
  });

  it("prefers pix_qrcode over qrcode and keeps the optional rendered URL", async () => {
    const fetch = vi.fn(async () =>
      orderSuccess({
        payment_method: "pix",
        pix_qrcode: pixCopyPasteCode,
        qrcode: "ignored-fallback",
        pix_qrcode_url: "https://qrcode.btgpactual.com/v1/abc123.png",
      }),
    );
    const adapter = createPricingOrdersAdapter({ fetch });

    const result = await adapter.createOnrampOrder({ apiKey, quoteUuid });

    expect(result.pixCopyPaste).toBe(pixCopyPasteCode);
    expect(result.pixQrcodeUrl).toBe("https://qrcode.btgpactual.com/v1/abc123.png");
  });

  it("keeps PIX fields absent when the provider returns no copy-paste payload instead of inventing a URL", async () => {
    const fetch = vi.fn(async () => orderSuccess({ payment_method: "webpay", provider_url: "https://webpay3g.transbank.cl/x" }));
    const adapter = createPricingOrdersAdapter({ fetch });

    const result = await adapter.createOnrampOrder({ apiKey, quoteUuid });

    expect(result.paymentMethod).toBe("webpay");
    expect("pixCopyPaste" in result).toBe(false);
    expect("pixQrcodeUrl" in result).toBe(false);
  });

  it.each([
    ["bad quote uuid", { quoteUuid: "not-a-uuid" }],
    ["blank api key", { apiKey: " " }],
    ["non-string deposit value", { depositFields: { first_name: 42 } }],
    ["empty deposit key", { depositFields: { "": "x" } }],
    ["oversized deposit key", { depositFields: { ["k".repeat(129)]: "x" } }],
    ["oversized deposit value", { depositFields: { first_name: "v".repeat(1025) } }],
    ["too many deposit fields", { depositFields: Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, "v"])) }],
    ["array deposit fields", { depositFields: ["first_name"] }],
    ["oversized description", { description: "d".repeat(501) }],
    ["bad pos uuid", { posUuid: "pos-1" }],
    ["additional info non-string key", { additionalInfos: [{ key: 1, value: "x" }] }],
    ["additional info missing value", { additionalInfos: [{ key: "customer_id" }] }],
    ["too many additional infos", { additionalInfos: Array.from({ length: 33 }, (_, i) => ({ key: `k${i}`, value: "v" })) }],
  ])("rejects invalid input before dispatch with zero fetch: %s", async (_label, override) => {
    const fetch = vi.fn();
    const adapter = createPricingOrdersAdapter({ fetch });
    const input = { apiKey, quoteUuid, ...override } as Parameters<typeof adapter.createOnrampOrder>[0];

    await expect(adapter.createOnrampOrder(input)).rejects.toBeInstanceOf(NauttOrderValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a definitive validation error when serialization fails before dispatch", async () => {
    const fetch = vi.fn();
    const adapter = createPricingOrdersAdapter({
      fetch,
      serialize: () => {
        throw new Error(`cannot serialize ${apiKey}`);
      },
    });

    const error = await adapter.createOnrampOrder({ apiKey, quoteUuid }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttOrderValidationError);
    expectRedacted(error);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404, 422, 429, 500, 599])(
    "returns one redacted indeterminate result for HTTP %s with exactly one fetch and no retry",
    async (status) => {
      const fetch = vi.fn(async () => new Response(JSON.stringify({ secret: apiKey, payer: payerDocument }), { status }));
      const adapter = createPricingOrdersAdapter({ fetch });

      const error = await adapter.createOnrampOrder({ apiKey, quoteUuid }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NauttOrderCreationIndeterminateError);
      expect(String(error)).toBe("NauttOrderCreationIndeterminateError: Nautt order creation is indeterminate");
      expectRedacted(error);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["missing crypto amount", { crypto_amount: undefined }],
    ["numeric fiat amount", { fiat_amount: 1000 }],
    ["card-style status casing", { status: "New" }],
    ["unknown status", { status: "settled" }],
    ["missing expiry", { expire_at: undefined }],
    ["invalid expiry", { expire_at: "not-a-date" }],
    ["missing order uuid", { uuid: undefined }],
    ["non-decimal quote", { nautt_quote: "5.1e0" }],
  ])("treats a malformed 201 as indeterminate with one fetch: %s", async (_label, overrides) => {
    const fetch = vi.fn(async () => orderSuccess({ payment_method: "pix", qrcode: pixCopyPasteCode }, overrides));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter.createOnrampOrder({ apiKey, quoteUuid }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttOrderCreationIndeterminateError);
    expectRedacted(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a 201 without payment_data as indeterminate with one fetch", async () => {
    const fetch = vi.fn(async () => orderSuccess({ payment_method: "pix" }, { payment_data: undefined }));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter.createOnrampOrder({ apiKey, quoteUuid }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttOrderCreationIndeterminateError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error(`transport leaked ${apiKey}`),
    new DOMException("timed out", "TimeoutError"),
    new DOMException("aborted", "AbortError"),
  ])("treats transport, timeout, and abort as indeterminate with one fetch", async (failure) => {
    const fetch = vi.fn(async () => Promise.reject(failure));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter.createOnrampOrder({ apiKey, quoteUuid }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttOrderCreationIndeterminateError);
    expectRedacted(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a non-JSON 201 as indeterminate with one fetch and no body leakage", async () => {
    const fetch = vi.fn(async () => new Response(`<html>${apiKey}${payerName}</html>`, { status: 201 }));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter.createOnrampOrder({ apiKey, quoteUuid }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttOrderCreationIndeterminateError);
    expectRedacted(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("Nautt order read adapter", () => {
  it("sends the exact owned GET request and preserves exact amounts and lowercase status", async () => {
    const fetch = vi.fn(async () =>
      orderSuccess({ payment_method: "pix", qrcode: pixCopyPasteCode }, { status: "finished" }, 200),
    );
    const timeoutSignal = new AbortController().signal;
    const createTimeoutSignal = vi.fn(() => timeoutSignal);
    const adapter = createPricingOrdersAdapter({ fetch, createTimeoutSignal });

    const result = await adapter.getOrder({ apiKey, orderUuid });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(`https://api.nauttfinance.com/api/v2/orders/${orderUuid}`, {
      method: "GET",
      headers: { "X-API-Key": apiKey },
      signal: timeoutSignal,
    });
    expect(result).toEqual({
      orderUuid,
      status: "finished",
      fiatAmount: "1000.0000",
      cryptoAmount: "196.0784",
      nauttQuote: "5.1000",
      expiresAt: new Date("2025-01-15T18:30:00+00:00"),
      paymentMethod: "pix",
      pixCopyPaste: pixCopyPasteCode,
    });
    expect(JSON.stringify(result)).not.toContain(userEmail);
  });

  it.each([403, 404])("maps provider %s to one opaque not-found result", async (status) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ message: payerName }), { status }));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter.getOrder({ apiKey, orderUuid }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttOrderNotFoundError);
    expectRedacted(error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("makes 403 and 404 caller-visible results indistinguishable", async () => {
    const results = await Promise.all(
      [403, 404].map(async (status) => {
        const adapter = createPricingOrdersAdapter({ fetch: vi.fn(async () => new Response("{}", { status })) });
        const error = (await adapter.getOrder({ apiKey, orderUuid }).catch((caught: unknown) => caught)) as Error;
        return { name: error.name, message: error.message, serialized: JSON.stringify(error) };
      }),
    );

    expect(results[0]).toEqual(results[1]);
  });

  it.each([400, 401, 429, 500])("redacts other HTTP %s read failures", async (status) => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ secret: apiKey }), { status }));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter.getOrder({ apiKey, orderUuid }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttOrderReadAdapterError);
    expectRedacted(error);
  });

  it.each([
    ["bad status casing", { status: "New" }],
    ["missing amounts", { fiat_amount: undefined }],
    ["invalid expiry", { expire_at: "tomorrow" }],
  ])("rejects a malformed 200 read: %s", async (_label, overrides) => {
    const fetch = vi.fn(async () => orderSuccess({ payment_method: "pix", qrcode: pixCopyPasteCode }, overrides, 200));
    const adapter = createPricingOrdersAdapter({ fetch });

    const error = await adapter.getOrder({ apiKey, orderUuid }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NauttOrderReadAdapterError);
    expectRedacted(error);
  });

  it.each([new Error(`transport ${apiKey}`), new DOMException("timed out", "TimeoutError")])(
    "redacts transport and timeout read failures",
    async (failure) => {
      const adapter = createPricingOrdersAdapter({ fetch: vi.fn(async () => Promise.reject(failure)) });

      const error = await adapter.getOrder({ apiKey, orderUuid }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(NauttOrderReadAdapterError);
      expectRedacted(error);
    },
  );

  it("rejects a malformed order UUID before dispatch", async () => {
    const fetch = vi.fn();
    const adapter = createPricingOrdersAdapter({ fetch });

    await expect(adapter.getOrder({ apiKey, orderUuid: "not-a-uuid" })).rejects.toBeInstanceOf(NauttOrderValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });
});

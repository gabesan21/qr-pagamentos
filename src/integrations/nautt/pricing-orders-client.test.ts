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

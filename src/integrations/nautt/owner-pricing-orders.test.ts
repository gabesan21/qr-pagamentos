import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createOwnerPricingOrdersService,
  OwnerPricingOrdersError,
} from "./owner-pricing-orders";
import {
  createPricingOrdersAdapter,
  NauttOrderCreationIndeterminateError,
  NauttPricingAdapterError,
} from "./pricing-orders-client";
import { createInMemoryQuoteOwnershipStore } from "./quote-ownership";

const ownerA = "110e8400-e29b-41d4-a716-446655440011";
const ownerB = "220e8400-e29b-41d4-a716-446655440022";
const keyA = "ntt_key-for-owner-a";
const keyB = "ntt_key-for-owner-b";
const currencyUuid = "550e8400-e29b-41d4-a716-446655440000";
const exchangeCurrencyUuid = "770e8400-e29b-41d4-a716-446655440002";
const quoteUuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const orderUuid = "990e8400-e29b-41d4-a716-446655440004";
const pixCopyPasteCode = "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const T0 = new Date("2026-07-17T20:00:00.000Z");

function quoteSuccess(uuid: string = quoteUuid) {
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
        quote_uuid: uuid,
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function orderCreated() {
  return new Response(
    JSON.stringify({
      message: "Order created successfully",
      code: "order.order_created",
      data: {
        uuid: orderUuid,
        order_type: "deposit",
        status: "new",
        fiat_amount: "1000.0000",
        crypto_amount: "196.0784",
        nautt_quote: "5.1000",
        expire_at: "2025-01-15T18:30:00+00:00",
        payer: { name: "Maria Santos", document_type: "CPF", document: "12345678900" },
        payment_data: { payment_method: "pix", qrcode: pixCopyPasteCode },
        user: { uuid: "660e8400-e29b-41d4-a716-446655440001", name: "Maria Santos", email: "maria@example.com" },
      },
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

function orderRetrieved() {
  const response = orderCreated();
  return new Response(response.body, { status: 200, headers: { "content-type": "application/json" } });
}

function fakeCredentialPort(keys: Record<string, string>) {
  const calls: string[] = [];
  return {
    calls,
    async getDecryptedApiKey(ownerId: string): Promise<string> {
      calls.push(ownerId);
      const key = keys[ownerId];
      if (!key) throw new Error("credential not found");
      return key;
    },
  };
}

function harness(options: { now?: () => Date; adapterNow?: () => Date } = {}) {
  const fetch = vi.fn();
  const credentials = fakeCredentialPort({ [ownerA]: keyA, [ownerB]: keyB });
  const store = createInMemoryQuoteOwnershipStore();
  const adapter = createPricingOrdersAdapter({ fetch, now: options.adapterNow ?? (() => T0) });
  const service = createOwnerPricingOrdersService(credentials, adapter, store, options.now ?? (() => T0));
  return { fetch, credentials, store, service };
}

const fiatQuoteInput = {
  currencyUuid,
  exchangeCurrencyUuid,
  amount: { kind: "fiat", value: "500.00" } as const,
};

describe("owner quote issuance", () => {
  it("decrypts exactly the caller-derived owner key, sends the exact request, and registers owner and authoritative expiry", async () => {
    const { fetch, credentials, service } = harness();
    fetch.mockResolvedValueOnce(quoteSuccess());

    const quote = await service.quote(ownerA, fiatQuoteInput);

    expect(credentials.calls).toEqual([ownerA]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.nauttfinance.com/api/v2/pricing/panel/buy");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(keyA);
    expect(quote.quoteUuid).toBe(quoteUuid);
    expect(quote.expiresAt).toEqual(new Date("2026-07-17T20:05:00.000Z"));
    expect(JSON.stringify(quote)).not.toContain(keyA);
  });

  it("rejects invalid local input before any decryption or fetch", async () => {
    const { fetch, credentials, service } = harness();

    await expect(
      service.quote(ownerA, { ...fiatQuoteInput, amount: { kind: "fiat", value: "0.00" } }),
    ).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    await expect(service.quote(ownerA, { ...fiatQuoteInput, currencyUuid: "bad" })).rejects.toBeInstanceOf(
      OwnerPricingOrdersError,
    );
    await expect(service.quote("not-a-uuid", fiatQuoteInput)).rejects.toBeInstanceOf(OwnerPricingOrdersError);

    expect(credentials.calls).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps credential decryption failure to the opaque error with zero fetch", async () => {
    const { fetch, service } = harness();
    const unknownOwner = "330e8400-e29b-41d4-a716-446655440033";

    await expect(service.quote(unknownOwner, fiatQuoteInput)).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("propagates the redacted provider pricing failure", async () => {
    const { fetch, service } = harness();
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ secret: keyA }), { status: 400 }));

    await expect(service.quote(ownerA, fiatQuoteInput)).rejects.toBeInstanceOf(NauttPricingAdapterError);
  });

  it("refuses to expose a quote whose UUID collides in the registry instead of reassigning ownership", async () => {
    const { fetch, service } = harness();
    fetch.mockResolvedValueOnce(quoteSuccess());
    await service.quote(ownerA, fiatQuoteInput);
    fetch.mockResolvedValueOnce(quoteSuccess());

    await expect(service.quote(ownerB, fiatQuoteInput)).rejects.toBeInstanceOf(OwnerPricingOrdersError);
  });
});

describe("owner order creation with quote ownership claims", () => {
  it("accepts a JSON-serialized and reconstructed quote reference on the same registry instance", async () => {
    const { fetch, service } = harness();
    fetch.mockResolvedValueOnce(quoteSuccess());
    const quote = await service.quote(ownerA, fiatQuoteInput);
    const reconstructed = JSON.parse(JSON.stringify(quote)) as { quoteUuid: string };
    fetch.mockResolvedValueOnce(orderCreated());

    const order = await service.createOrder(ownerA, reconstructed, {
      depositFields: { first_name: "Gabriel" },
      description: "PIX deposit",
      additionalInfos: [{ key: "reference", value: "ORDER-2025-001" }],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, init] = fetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.nauttfinance.com/api/v2/orders/onramp");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(keyA);
    expect(init.body).toBe(
      JSON.stringify({
        quote_uuid: quoteUuid,
        deposit_fields: { first_name: "Gabriel" },
        description: "PIX deposit",
        additional_infos: [{ key: "reference", value: "ORDER-2025-001" }],
      }),
    );
    expect(order).toEqual({
      orderUuid,
      status: "new",
      fiatAmount: "1000.0000",
      cryptoAmount: "196.0784",
      nauttQuote: "5.1000",
      expiresAt: new Date("2025-01-15T18:30:00+00:00"),
      paymentMethod: "pix",
      pixCopyPaste: pixCopyPasteCode,
    });
    expect(JSON.stringify(order)).not.toContain("maria@example.com");
  });

  it("rejects an unknown quote reference with zero decryptions and zero fetch calls", async () => {
    const { fetch, credentials, service } = harness();

    await expect(service.createOrder(ownerA, { quoteUuid }, {})).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(credentials.calls).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails closed on a fresh registry after restart: a previously valid serialized reference is unknown", async () => {
    const { fetch, credentials, service } = harness();
    fetch.mockResolvedValueOnce(quoteSuccess());
    const quote = await service.quote(ownerA, fiatQuoteInput);
    const reconstructed = JSON.parse(JSON.stringify(quote)) as { quoteUuid: string };

    const restarted = harness();
    await expect(restarted.service.createOrder(ownerA, reconstructed, {})).rejects.toBeInstanceOf(
      OwnerPricingOrdersError,
    );
    expect(restarted.credentials.calls).toEqual([]);
    expect(restarted.fetch).not.toHaveBeenCalled();
    expect(credentials.calls).toEqual([ownerA]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-owner claim with zero decryptions/fetches and does not consume the rightful owner's quote", async () => {
    const { fetch, credentials, service } = harness();
    fetch.mockResolvedValueOnce(quoteSuccess());
    await service.quote(ownerA, fiatQuoteInput);

    await expect(service.createOrder(ownerB, { quoteUuid }, {})).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(credentials.calls).toEqual([ownerA]);
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce(orderCreated());
    const order = await service.createOrder(ownerA, { quoteUuid }, {});
    expect(order.orderUuid).toBe(orderUuid);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects an expired quote at claim time with zero decryptions and zero fetch calls", async () => {
    const { fetch, credentials, service } = harness({ now: () => new Date("2026-07-17T20:06:00.000Z") });
    fetch.mockResolvedValueOnce(quoteSuccess());
    const quote = await service.quote(ownerA, fiatQuoteInput);
    expect(quote.expiresAt).toEqual(new Date("2026-07-17T20:05:00.000Z"));

    await expect(service.createOrder(ownerA, { quoteUuid }, {})).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(credentials.calls).toEqual([ownerA]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a consumed quote replay with zero decryptions and zero additional fetch calls", async () => {
    const { fetch, credentials, service } = harness();
    fetch.mockResolvedValueOnce(quoteSuccess());
    await service.quote(ownerA, fiatQuoteInput);
    fetch.mockResolvedValueOnce(orderCreated());
    await service.createOrder(ownerA, { quoteUuid }, {});

    await expect(service.createOrder(ownerA, { quoteUuid }, {})).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(credentials.calls).toEqual([ownerA, ownerA]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed creation input before claim, decryption, or dispatch", async () => {
    const { fetch, credentials, service } = harness();
    fetch.mockResolvedValueOnce(quoteSuccess());
    await service.quote(ownerA, fiatQuoteInput);

    await expect(
      service.createOrder(ownerA, { quoteUuid }, { depositFields: { first_name: 7 } as never }),
    ).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(credentials.calls).toEqual([ownerA]);
    expect(fetch).toHaveBeenCalledTimes(1);

    fetch.mockResolvedValueOnce(orderCreated());
    await service.createOrder(ownerA, { quoteUuid }, {});
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("propagates the indeterminate creation result, consumes the quote, and never retries", async () => {
    const { fetch, credentials, service } = harness();
    fetch.mockResolvedValueOnce(quoteSuccess());
    await service.quote(ownerA, fiatQuoteInput);
    fetch.mockRejectedValueOnce(new Error(`transport leaked ${keyA}`));

    const error = await service.createOrder(ownerA, { quoteUuid }, {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NauttOrderCreationIndeterminateError);
    expect(String(error)).not.toContain(keyA);
    expect(fetch).toHaveBeenCalledTimes(2);

    await expect(service.createOrder(ownerA, { quoteUuid }, {})).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(credentials.calls).toEqual([ownerA, ownerA]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("owner order read", () => {
  it("decrypts exactly the owner key and returns the redacted view", async () => {
    const { fetch, credentials, service } = harness();
    fetch.mockResolvedValueOnce(orderRetrieved());

    const order = await service.getOrder(ownerA, orderUuid);

    expect(credentials.calls).toEqual([ownerA]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.nauttfinance.com/api/v2/orders/${orderUuid}`);
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(keyA);
    expect(order.status).toBe("new");
    expect(JSON.stringify(order)).not.toContain("Maria Santos");
  });

  it("rejects malformed owner or order identifiers before decryption or dispatch", async () => {
    const { fetch, credentials, service } = harness();

    await expect(service.getOrder("bad", orderUuid)).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    await expect(service.getOrder(ownerA, "bad")).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(credentials.calls).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("in-memory quote ownership store", () => {
  it("does not overwrite or reassign an existing quote UUID on duplicate register", async () => {
    const store = createInMemoryQuoteOwnershipStore();
    const expiresAt = new Date("2026-07-17T20:05:00.000Z");

    expect(await store.register({ quoteUuid, ownerId: ownerA, expiresAt })).toBe(true);
    expect(await store.register({ quoteUuid, ownerId: ownerB, expiresAt })).toBe(false);

    expect(await store.claimForCreation({ quoteUuid, ownerId: ownerB, now: T0 })).toBe("unavailable");
    expect(await store.claimForCreation({ quoteUuid, ownerId: ownerA, now: T0 })).toBe("claimed");
  });

  it("checks owner before consuming: a cross-owner miss leaves the quote claimable", async () => {
    const store = createInMemoryQuoteOwnershipStore();
    await store.register({ quoteUuid, ownerId: ownerA, expiresAt: new Date("2026-07-17T20:05:00.000Z") });

    expect(await store.claimForCreation({ quoteUuid, ownerId: ownerB, now: T0 })).toBe("unavailable");
    expect(await store.claimForCreation({ quoteUuid, ownerId: ownerA, now: T0 })).toBe("claimed");
    expect(await store.claimForCreation({ quoteUuid, ownerId: ownerA, now: T0 })).toBe("unavailable");
  });
});

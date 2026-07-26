import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPrismaStandaloneCheckoutStore, createStandaloneCheckoutService } from "./standalone-checkout";
import { NauttOrderCreationIndeterminateError } from "@/integrations/nautt/pricing-orders-client";

const now = new Date("2026-07-26T15:00:00.000Z");
const key = Buffer.alloc(32, 7);
const identifiers = { slug: "minha-loja", attempt: "110e8400-e29b-41d4-a716-446655440011", order: "220e8400-e29b-41d4-a716-446655440022", owner: "330e8400-e29b-41d4-a716-446655440033" };
const customer = { name: null, email: null, cpf: null, address: null };
const validBody = { idempotencyKey: "retry-key-with-enough-entropy", amount: "12.5", customer };

function capability(attempt: { id: string; capabilityNonce: string; capabilityExpiresAt: Date; capabilityKeyVersion: string }) {
  return createHmac("sha256", key).update(`standalone-checkout-capability:${attempt.capabilityKeyVersion}:${attempt.id}:${attempt.capabilityExpiresAt.toISOString()}:${attempt.capabilityNonce}`).digest("base64url");
}
function attempt(state: "RESERVED" | "PENDING" | "INDETERMINATE" = "RESERVED", owner = { storefrontEnabled: true, storefrontStandalonePaymentsEnabled: true }) {
  const value = { id: identifiers.attempt, ownerId: identifiers.owner, orderV2Id: identifiers.order, requestVerifier: "a".repeat(64), capabilityNonce: "n".repeat(43), capabilityKeyVersion: "v1", capabilityVerifier: "", capabilityExpiresAt: new Date("2026-07-27T15:00:00.000Z"), capabilityRevokedAt: null, state, owner, order: { providerOrders: state === "PENDING" ? [{ status: "new", pixCopyPaste: "000201", pixQrcodeUrl: null }] : [] } };
  return { ...value, capabilityVerifier: createHash("sha256").update(capability(value)).digest("hex") };
}
function harness(reservation: unknown) {
  const pending = attempt("PENDING");
  const store = { reserve: vi.fn().mockResolvedValue(reservation), markCreating: vi.fn().mockResolvedValue(true), markPending: vi.fn().mockResolvedValue(pending), markIndeterminate: vi.fn().mockResolvedValue(attempt("INDETERMINATE")) };
  const provider = { quote: vi.fn().mockResolvedValue({ quoteUuid: "440e8400-e29b-41d4-a716-446655440044" }), createOrder: vi.fn().mockResolvedValue({}) };
  return { store, provider, service: createStandaloneCheckoutService(store, { now: () => now, capabilityKey: () => key, provider: provider as never }) };
}
const createdReservation = () => ({ kind: "created", attempt: attempt(), ownerId: identifiers.owner, amount: "12.5", currencyUuid: "550e8400-e29b-41d4-a716-446655440055", exchangeCurrencyUuid: "660e8400-e29b-41d4-a716-446655440066" });

describe("standalone checkout orchestration", () => {
  it("creates one trusted quote/order flow attached to the V2 order and returns only the pending capability", async () => {
    const created = attempt();
    const { service, provider, store } = harness(createdReservation());

    await expect(service.checkout(identifiers.slug, validBody)).resolves.toEqual({ kind: "accepted", status: 201, payment: { state: "PENDING", pixCopyPaste: "000201" }, statusCapability: capability(created) });
    expect(provider.quote).toHaveBeenCalledWith(identifiers.owner, expect.objectContaining({ amount: { kind: "fiat", value: "12.5" } }));
    expect(provider.createOrder).toHaveBeenCalledWith(identifiers.owner, { quoteUuid: "440e8400-e29b-41d4-a716-446655440044" }, {}, undefined, identifiers.order);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(store.markCreating).toHaveBeenCalledWith(identifiers.attempt);
    expect(store.markPending).toHaveBeenCalledWith(identifiers.attempt);
  });

  it("reissues only an exact durable replay without a quote or provider POST", async () => {
    const replay = attempt("PENDING");
    const { service, provider, store } = harness({ kind: "replay", attempt: replay });
    const result = await service.checkout(identifiers.slug, validBody);
    expect(result).toMatchObject({ kind: "accepted", status: 201, statusCapability: capability(replay) });
    expect(provider.quote).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
    expect(store.markCreating).not.toHaveBeenCalled();
    expect(store.markPending).not.toHaveBeenCalled();
  });

  it.each([
    ["storefront disabled", { storefrontEnabled: false, storefrontStandalonePaymentsEnabled: true }],
    ["standalone payments disabled", { storefrontEnabled: true, storefrontStandalonePaymentsEnabled: false }],
  ])("keeps a replay unavailable when %s", async (_label, owner) => {
    const replay = attempt("PENDING", owner);
    const { service, provider } = harness({ kind: "replay", attempt: replay });
    await expect(service.checkout(identifiers.slug, validBody)).resolves.toEqual({ kind: "unavailable" });
    expect(provider.quote).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it("returns the durable indeterminate capability after a dispatched Nautt POST ambiguity", async () => {
    const indeterminate = attempt("INDETERMINATE");
    const replay = attempt("INDETERMINATE");
    const { service, provider, store } = harness(createdReservation());
    store.markIndeterminate.mockResolvedValueOnce(indeterminate);
    store.reserve.mockResolvedValueOnce({ kind: "replay", attempt: replay });
    provider.createOrder.mockRejectedValueOnce(new NauttOrderCreationIndeterminateError());

    await expect(service.checkout(identifiers.slug, validBody)).resolves.toEqual({ kind: "accepted", status: 202, payment: { state: "INDETERMINATE" }, statusCapability: capability(indeterminate) });
    await expect(service.checkout(identifiers.slug, validBody)).resolves.toEqual({ kind: "accepted", status: 202, payment: { state: "INDETERMINATE" }, statusCapability: capability(replay) });
    expect(provider.quote).toHaveBeenCalledTimes(1);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(store.markIndeterminate).toHaveBeenCalledWith(identifiers.attempt);
  });

  it.each([
    ["missing amount", { idempotencyKey: "retry-key-with-enough-entropy", customer }],
    ["extra trusted field", { ...validBody, ownerId: identifiers.owner }],
    ["currency supplied", { ...validBody, currency: "BRL" }],
    ["short retry key", { ...validBody, idempotencyKey: "short" }],
    ["zero amount", { ...validBody, amount: "0" }],
    ["non-canonical amount", { ...validBody, amount: "10.2.5" }],
    ["exponent amount", { ...validBody, amount: "1e5" }],
    ["padded amount", { ...validBody, amount: " 12.50" }],
    ["negative amount", { ...validBody, amount: "-1" }],
  ])("rejects %s before any store or provider work", async (_label, body) => {
    const { service, store, provider } = harness(createdReservation());
    await expect(service.checkout(identifiers.slug, body)).resolves.toEqual({ kind: "invalid" });
    expect(store.reserve).not.toHaveBeenCalled();
    expect(provider.quote).not.toHaveBeenCalled();
  });

  it.each([["Invalid Slug"], ["-leading-hyphen"], ["a".repeat(64)]])("rejects the malformed slug %s before store work", async (slug) => {
    const { service, store } = harness(createdReservation());
    await expect(service.checkout(slug, validBody)).resolves.toEqual({ kind: "invalid" });
    expect(store.reserve).not.toHaveBeenCalled();
  });

  it("keeps store-level unavailability opaque with zero provider calls", async () => {
    const { service, provider } = harness({ kind: "unavailable" });
    await expect(service.checkout(identifiers.slug, validBody)).resolves.toEqual({ kind: "unavailable" });
    expect(provider.quote).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it("keeps pre-dispatch provider failures redacted", async () => {
    const { service, provider, store } = harness(createdReservation());
    provider.quote.mockRejectedValueOnce(new Error("provider body must not escape"));
    await expect(service.checkout(identifiers.slug, validBody)).resolves.toEqual({ kind: "provider-unavailable" });
    expect(store.markIndeterminate).toHaveBeenCalledWith(identifiers.attempt);
  });
});

describe("standalone checkout reservation store", () => {
  const ownerRow = { ownerId: identifiers.owner, checkoutDataPolicy: "NONE", defaultCurrencyCode: "BRL" };
  const pairRow = { currencyUuid: "550e8400-e29b-41d4-a716-446655440055", exchangeCurrencyUuid: "660e8400-e29b-41d4-a716-446655440066" };
  function txWith(queryResults: unknown[][], existing: unknown = null) {
    const queryRaw = vi.fn();
    for (const result of queryResults) queryRaw.mockResolvedValueOnce(result);
    const orderV2 = { create: vi.fn().mockResolvedValue({}) };
    const standaloneCheckoutAttempt = {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue(attempt()),
    };
    const tx = { $queryRaw: queryRaw, orderV2, standaloneCheckoutAttempt };
    const store = createPrismaStandaloneCheckoutStore({ $transaction: vi.fn((work) => work(tx)) } as never, key);
    return { store, tx };
  }

  it("resolves owner, policy, and pair from locked persisted state and shapes the standalone order server-side", async () => {
    const { store, tx } = txWith([[ownerRow], [pairRow]]);
    const result = await store.reserve({ slug: identifiers.slug, retryKey: validBody.idempotencyKey, amount: validBody.amount, customer, now });
    expect(result.kind).toBe("created");
    expect(tx.orderV2.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: identifiers.owner,
        source: "STANDALONE",
        paymentLinkV2Id: null,
        state: "CREATED",
        amount: "12.5",
        currencyUuid: pairRow.currencyUuid,
        exchangeCurrencyUuid: pairRow.exchangeCurrencyUuid,
        descriptionPtBr: expect.any(String),
        descriptionEn: expect.any(String),
        checkoutDataPolicy: "NONE",
      }),
    });
    expect(tx.standaloneCheckoutAttempt.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["unknown or disabled slug/toggles", [[], [pairRow]]],
    ["null stored currency code", [[{ ...ownerRow, defaultCurrencyCode: null }], [pairRow]]],
    ["deactivated mapping or inactive pair", [[ownerRow], []]],
  ])("maps %s to the one opaque unavailable outcome", async (_label, results) => {
    const { store, tx } = txWith(results as unknown[][]);
    await expect(store.reserve({ slug: identifiers.slug, retryKey: validBody.idempotencyKey, amount: validBody.amount, customer, now })).resolves.toEqual({ kind: "unavailable" });
    expect(tx.orderV2.create).not.toHaveBeenCalled();
    expect(tx.standaloneCheckoutAttempt.create).not.toHaveBeenCalled();
  });

  it("rejects a customer snapshot outside the owner policy tuple as invalid", async () => {
    const { store, tx } = txWith([[ownerRow], [pairRow]]);
    await expect(store.reserve({ slug: identifiers.slug, retryKey: validBody.idempotencyKey, amount: validBody.amount, customer: { ...customer, name: "Ana" }, now })).resolves.toEqual({ kind: "invalid" });
    expect(tx.orderV2.create).not.toHaveBeenCalled();
  });

  it("replays an exact request and keeps a changed payload opaque", async () => {
    const retryKeyVerifier = createHmac("sha256", key).update(`standalone-checkout-retry:${validBody.idempotencyKey}`).digest("hex");
    const requestVerifier = createHmac("sha256", key).update(`standalone-checkout-request:v1:${identifiers.owner}:${retryKeyVerifier}:NONE:12.5:${JSON.stringify(customer)}`).digest("hex");
    const existing = { ...attempt("PENDING"), requestVerifier };
    const matching = txWith([[ownerRow], [pairRow]], existing);
    const replay = await matching.store.reserve({ slug: identifiers.slug, retryKey: validBody.idempotencyKey, amount: validBody.amount, customer, now });
    expect(replay).toEqual({ kind: "replay", attempt: existing });
    expect(matching.tx.orderV2.create).not.toHaveBeenCalled();

    const mismatched = txWith([[ownerRow], [pairRow]], existing);
    await expect(mismatched.store.reserve({ slug: identifiers.slug, retryKey: validBody.idempotencyKey, amount: "99.99", customer, now })).resolves.toEqual({ kind: "unavailable" });
    expect(mismatched.tx.orderV2.create).not.toHaveBeenCalled();
  });
});

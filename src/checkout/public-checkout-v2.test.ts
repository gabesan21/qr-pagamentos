import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPrismaCheckoutV2Store, createPublicCheckoutV2Service } from "./public-checkout-v2";
import { NauttOrderCreationIndeterminateError } from "@/integrations/nautt/pricing-orders-client";

const now = new Date("2026-07-26T15:00:00.000Z");
const key = Buffer.alloc(32, 7);
const identifiers = { link: "AbCdEfGhIjKlMnOpQrStUvWx", attempt: "110e8400-e29b-41d4-a716-446655440011", order: "220e8400-e29b-41d4-a716-446655440022", owner: "330e8400-e29b-41d4-a716-446655440033", linkRow: "440e8400-e29b-41d4-a716-446655440044" };
const customer = { name: null, email: null, cpf: null, address: null };
const validBody = { idempotencyKey: "retry-key-with-enough-entropy", customer };

function capability(attempt: { id: string; capabilityNonce: string; capabilityExpiresAt: Date; capabilityKeyVersion: string }) {
  return createHmac("sha256", key).update(`checkout-v2-capability:${attempt.capabilityKeyVersion}:${attempt.id}:${attempt.capabilityExpiresAt.toISOString()}:${attempt.capabilityNonce}`).digest("base64url");
}
function attempt(state: "RESERVED" | "PENDING" | "INDETERMINATE" = "RESERVED") {
  const value = { id: identifiers.attempt, ownerId: identifiers.owner, orderV2Id: identifiers.order, requestVerifier: "a".repeat(64), capabilityNonce: "n".repeat(43), capabilityKeyVersion: "v1", capabilityVerifier: "", capabilityExpiresAt: new Date("2026-07-27T15:00:00.000Z"), capabilityRevokedAt: null, state, paymentLink: { active: true, expiresAt: null }, order: { providerOrders: state === "PENDING" ? [{ status: "new", pixCopyPaste: "000201", pixQrcodeUrl: null }] : [] } };
  return { ...value, capabilityVerifier: createHash("sha256").update(capability(value)).digest("hex") };
}
function harness(reservation: unknown) {
  const pending = attempt("PENDING");
  const store = { reserve: vi.fn().mockResolvedValue(reservation), markCreating: vi.fn().mockResolvedValue(true), markPending: vi.fn().mockResolvedValue(pending), markIndeterminate: vi.fn().mockResolvedValue(attempt("INDETERMINATE")) };
  const provider = { quote: vi.fn().mockResolvedValue({ quoteUuid: "550e8400-e29b-41d4-a716-446655440055" }), createOrder: vi.fn().mockResolvedValue({}) };
  return { store, provider, service: createPublicCheckoutV2Service(store, { now: () => now, capabilityKey: () => key, provider: provider as never }) };
}
const createdReservation = () => ({ kind: "created", attempt: attempt(), ownerId: identifiers.owner, amount: "12.50", currencyUuid: "660e8400-e29b-41d4-a716-446655440066", exchangeCurrencyUuid: "770e8400-e29b-41d4-a716-446655440077" });

describe("public checkout V2 orchestration", () => {
  it("creates one trusted quote/order flow attached to the V2 order and returns only the pending capability", async () => {
    const created = attempt();
    const { service, provider, store } = harness(createdReservation());

    await expect(service.checkout(identifiers.link, validBody)).resolves.toEqual({ kind: "accepted", status: 201, payment: { state: "PENDING", pixCopyPaste: "000201" }, statusCapability: capability(created) });
    expect(provider.quote).toHaveBeenCalledWith(identifiers.owner, expect.objectContaining({ amount: { kind: "fiat", value: "12.50" } }));
    expect(provider.createOrder).toHaveBeenCalledWith(identifiers.owner, { quoteUuid: "550e8400-e29b-41d4-a716-446655440055" }, {}, undefined, identifiers.order);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(store.markCreating).toHaveBeenCalledWith(identifiers.attempt);
    expect(store.markPending).toHaveBeenCalledWith(identifiers.attempt);
  });

  it("reissues only an exact durable replay without a quote or provider POST", async () => {
    const replay = attempt("PENDING");
    const { service, provider, store } = harness({ kind: "replay", attempt: replay });
    const result = await service.checkout(identifiers.link, validBody);
    expect(result).toMatchObject({ kind: "accepted", status: 201, statusCapability: capability(replay) });
    expect(provider.quote).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
    expect(store.markCreating).not.toHaveBeenCalled();
    expect(store.markPending).not.toHaveBeenCalled();
  });

  it("keeps a replay unavailable when the link turned inactive or expired", async () => {
    const replay = { ...attempt("PENDING"), paymentLink: { active: false, expiresAt: null } };
    const { service, provider } = harness({ kind: "replay", attempt: replay });
    await expect(service.checkout(identifiers.link, validBody)).resolves.toEqual({ kind: "unavailable" });
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

    await expect(service.checkout(identifiers.link, validBody)).resolves.toEqual({ kind: "accepted", status: 202, payment: { state: "INDETERMINATE" }, statusCapability: capability(indeterminate) });
    await expect(service.checkout(identifiers.link, validBody)).resolves.toEqual({ kind: "accepted", status: 202, payment: { state: "INDETERMINATE" }, statusCapability: capability(replay) });
    expect(provider.quote).toHaveBeenCalledTimes(1);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(store.markIndeterminate).toHaveBeenCalledWith(identifiers.attempt);
  });

  it.each([
    ["missing customer", { idempotencyKey: "retry-key-with-enough-entropy" }],
    ["missing retry key", { customer }],
    ["extra trusted field", { ...validBody, ownerId: identifiers.owner }],
    ["amount supplied", { ...validBody, amount: "12.50" }],
    ["currency supplied", { ...validBody, currency: "BRL" }],
    ["short retry key", { ...validBody, idempotencyKey: "short" }],
    ["malformed identifier", "not-a-link"],
  ])("rejects %s before any store or provider work", async (_label, candidate) => {
    const { service, store, provider } = harness(createdReservation());
    const body = typeof candidate === "string" ? validBody : candidate;
    const identifier = typeof candidate === "string" ? candidate : identifiers.link;
    await expect(service.checkout(identifier, body)).resolves.toEqual({ kind: "invalid" });
    expect(store.reserve).not.toHaveBeenCalled();
    expect(provider.quote).not.toHaveBeenCalled();
  });

  it("keeps store-level unavailability opaque with zero provider calls", async () => {
    const { service, provider } = harness({ kind: "unavailable" });
    await expect(service.checkout(identifiers.link, validBody)).resolves.toEqual({ kind: "unavailable" });
    expect(provider.quote).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it("keeps pre-dispatch provider failures redacted", async () => {
    const { service, provider, store } = harness(createdReservation());
    provider.quote.mockRejectedValueOnce(new Error("provider body must not escape"));
    await expect(service.checkout(identifiers.link, validBody)).resolves.toEqual({ kind: "provider-unavailable" });
    expect(store.markIndeterminate).toHaveBeenCalledWith(identifiers.attempt);
  });
});

describe("public checkout V2 reservation store", () => {
  const linkRow = { id: identifiers.linkRow, ownerId: identifiers.owner, checkoutDataPolicy: "NONE", expiresAt: null, linkType: "SINGLE_USE" };
  const storedOrder = { id: identifiers.order, ownerId: identifiers.owner, amount: "12.50", currencyUuid: "660e8400-e29b-41d4-a716-446655440066", exchangeCurrencyUuid: "770e8400-e29b-41d4-a716-446655440077" };
  function txWith({ link = linkRow, claim = null, existing = null, order = storedOrder }: { link?: unknown; claim?: unknown; existing?: unknown; order?: unknown } = {}) {
    const createOrder = vi.fn().mockResolvedValue(order);
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue(link ? [link] : []),
      paymentLinkV2SingleUseSettlement: { findUnique: vi.fn().mockResolvedValue(claim) },
      checkoutAttemptV2: { findUnique: vi.fn().mockResolvedValue(existing), create: vi.fn().mockResolvedValue(attempt()) },
    };
    const store = createPrismaCheckoutV2Store({ $transaction: vi.fn((work) => work(tx)) } as never, key, createOrder as never);
    return { store, tx, createOrder };
  }

  it("locks the link, delegates order shaping to the createFromLink seam, and quotes the seam-derived snapshot amount", async () => {
    const { store, tx, createOrder } = txWith();
    const result = await store.reserve({ identifier: identifiers.link, retryKey: validBody.idempotencyKey, customer, now });
    expect(result).toEqual({ kind: "created", attempt: attempt(), ownerId: identifiers.owner, amount: "12.50", currencyUuid: storedOrder.currencyUuid, exchangeCurrencyUuid: storedOrder.exchangeCurrencyUuid });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith(tx, { paymentLinkV2Id: identifiers.linkRow, snapshot: customer });
    expect(tx.checkoutAttemptV2.create).toHaveBeenCalledTimes(1);
    const persisted = tx.checkoutAttemptV2.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(persisted.data).toMatchObject({ ownerId: identifiers.owner, paymentLinkV2Id: identifiers.linkRow, orderV2Id: identifiers.order, state: "RESERVED", capabilityKeyVersion: "v1" });
    expect(persisted.data.capabilityExpiresAt).toEqual(new Date("2026-07-27T15:00:00.000Z"));
  });

  it("bounds the capability TTL by the link expiry", async () => {
    const { store, tx } = txWith({ link: { ...linkRow, expiresAt: new Date("2026-07-26T20:00:00.000Z") } });
    await store.reserve({ identifier: identifiers.link, retryKey: validBody.idempotencyKey, customer, now });
    const persisted = tx.checkoutAttemptV2.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(persisted.data.capabilityExpiresAt).toEqual(new Date("2026-07-26T20:00:00.000Z"));
  });

  it.each([
    ["an unknown, inactive, or expired identifier", { link: null }],
    ["a claimed single-use link", { claim: { paymentLinkV2Id: identifiers.linkRow } }],
    ["an unavailable order seam", { order: null }],
  ])("maps %s to the one opaque unavailable outcome without an attempt", async (_label, overrides) => {
    const { store, tx, createOrder } = txWith(overrides);
    await expect(store.reserve({ identifier: identifiers.link, retryKey: validBody.idempotencyKey, customer, now })).resolves.toEqual({ kind: "unavailable" });
    expect(tx.checkoutAttemptV2.create).not.toHaveBeenCalled();
    if (!("order" in overrides)) expect(createOrder).not.toHaveBeenCalled();
  });

  it("rejects a customer snapshot outside the locked owner policy tuple as invalid", async () => {
    const { store, createOrder } = txWith();
    await expect(store.reserve({ identifier: identifiers.link, retryKey: validBody.idempotencyKey, customer: { ...customer, name: "Ana" }, now })).resolves.toEqual({ kind: "invalid" });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("replays an exact request and keeps a changed payload opaque", async () => {
    const policyCustomer = { name: "Ana", email: "ana@example.com", cpf: null, address: null };
    const namedLink = { ...linkRow, checkoutDataPolicy: "NAME_EMAIL" };
    const retryKeyVerifier = createHmac("sha256", key).update(`checkout-v2-retry:${validBody.idempotencyKey}`).digest("hex");
    const requestVerifier = createHmac("sha256", key).update(`checkout-v2-request:${identifiers.linkRow}:${retryKeyVerifier}:NAME_EMAIL:${JSON.stringify(policyCustomer)}`).digest("hex");
    const existing = { ...attempt("PENDING"), requestVerifier };
    const matching = txWith({ link: namedLink, existing });
    const replay = await matching.store.reserve({ identifier: identifiers.link, retryKey: validBody.idempotencyKey, customer: policyCustomer, now });
    expect(replay).toEqual({ kind: "replay", attempt: existing });
    expect(matching.createOrder).not.toHaveBeenCalled();

    const mismatched = txWith({ link: namedLink, existing });
    await expect(mismatched.store.reserve({ identifier: identifiers.link, retryKey: validBody.idempotencyKey, customer: { ...policyCustomer, email: "other@example.com" }, now })).resolves.toEqual({ kind: "unavailable" });
    expect(mismatched.createOrder).not.toHaveBeenCalled();
  });
});

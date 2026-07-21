import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPrismaCheckoutStore, createPublicCheckoutService } from "./public-checkout";
import { NauttOrderCreationIndeterminateError } from "@/integrations/nautt/pricing-orders-client";

const now = new Date("2026-07-21T15:00:00.000Z");
const key = Buffer.alloc(32, 7);
const identifiers = { link: "AbCdEfGhIjKlMnOpQrStUvWx", attempt: "110e8400-e29b-41d4-a716-446655440011", order: "220e8400-e29b-41d4-a716-446655440022", owner: "330e8400-e29b-41d4-a716-446655440033" };
const customer = { name: null, email: null, cpf: null, address: null };

function capability(attempt: { id: string; capabilityNonce: string; capabilityExpiresAt: Date; capabilityKeyVersion: string }) {
  return createHmac("sha256", key).update(`checkout-capability:${attempt.capabilityKeyVersion}:${attempt.id}:${attempt.capabilityExpiresAt.toISOString()}:${attempt.capabilityNonce}`).digest("base64url");
}
function attempt(state: "RESERVED" | "PENDING" | "INDETERMINATE" = "RESERVED") {
  const value = { id: identifiers.attempt, ownerId: identifiers.owner, paymentLinkId: identifiers.link, paymentLinkOrderId: identifiers.order, requestVerifier: "a".repeat(64), capabilityNonce: "n".repeat(43), capabilityKeyVersion: "v1", capabilityVerifier: "", capabilityExpiresAt: new Date("2026-07-22T15:00:00.000Z"), capabilityRevokedAt: null, state, paymentLink: { active: true, expiresAt: null }, paymentLinkOrder: { providerOrder: state === "PENDING" ? { status: "new", pixCopyPaste: "000201", pixQrcodeUrl: null } : null } };
  return { ...value, capabilityVerifier: createHash("sha256").update(capability(value)).digest("hex") };
}
function harness(reservation: unknown) {
  const pending = attempt("PENDING");
  const store = { reserve: vi.fn().mockResolvedValue(reservation), markCreating: vi.fn().mockResolvedValue(true), markPending: vi.fn().mockResolvedValue(pending), markIndeterminate: vi.fn().mockResolvedValue(attempt("INDETERMINATE")) };
  const provider = { quote: vi.fn().mockResolvedValue({ quoteUuid: "440e8400-e29b-41d4-a716-446655440044" }), createOrder: vi.fn().mockResolvedValue({}) };
  return { store, provider, service: createPublicCheckoutService(store, { now: () => now, capabilityKey: () => key, provider: provider as never }) };
}

describe("public checkout orchestration", () => {
  it("creates one trusted quote/order flow and returns only the pending capability", async () => {
    const created = attempt();
    const { service, provider, store } = harness({ kind: "created", attempt: created, ownerId: identifiers.owner, amount: "12.50", currencyUuid: "550e8400-e29b-41d4-a716-446655440055", exchangeCurrencyUuid: "660e8400-e29b-41d4-a716-446655440066" });

    await expect(service.checkout(identifiers.link, { idempotencyKey: "retry-key-with-enough-entropy", customer })).resolves.toEqual({ kind: "accepted", status: 201, payment: { state: "PENDING", pixCopyPaste: "000201" }, statusCapability: capability(created) });
    expect(provider.quote).toHaveBeenCalledWith(identifiers.owner, expect.objectContaining({ amount: { kind: "fiat", value: "12.50" } }));
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(store.markCreating).toHaveBeenCalledWith(identifiers.attempt);
    expect(store.markPending).toHaveBeenCalledWith(identifiers.attempt);
  });

  it("reissues only an exact durable replay without a quote or provider POST", async () => {
    const replay = attempt("PENDING");
    const { service, provider, store } = harness({ kind: "replay", attempt: replay });
    const result = await service.checkout(identifiers.link, { idempotencyKey: "retry-key-with-enough-entropy", customer });
    expect(result).toMatchObject({ kind: "accepted", status: 201, statusCapability: capability(replay) });
    expect(provider.quote).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
    expect(store.markCreating).not.toHaveBeenCalled();
    expect(store.markPending).not.toHaveBeenCalled();
  });

  it("returns the durable indeterminate capability after a dispatched Nautt POST ambiguity", async () => {
    const created = attempt();
    const indeterminate = attempt("INDETERMINATE");
    const replay = attempt("INDETERMINATE");
    const { service, provider, store } = harness({ kind: "created", attempt: created, ownerId: identifiers.owner, amount: "12.50", currencyUuid: "550e8400-e29b-41d4-a716-446655440055", exchangeCurrencyUuid: "660e8400-e29b-41d4-a716-446655440066" });
    store.markIndeterminate.mockResolvedValueOnce(indeterminate);
    store.reserve.mockResolvedValueOnce({ kind: "replay", attempt: replay });
    provider.createOrder.mockRejectedValueOnce(new NauttOrderCreationIndeterminateError());

    await expect(service.checkout(identifiers.link, { idempotencyKey: "retry-key-with-enough-entropy", customer })).resolves.toEqual({ kind: "accepted", status: 202, payment: { state: "INDETERMINATE" }, statusCapability: capability(indeterminate) });
    await expect(service.checkout(identifiers.link, { idempotencyKey: "retry-key-with-enough-entropy", customer })).resolves.toEqual({ kind: "accepted", status: 202, payment: { state: "INDETERMINATE" }, statusCapability: capability(replay) });
    expect(provider.quote).toHaveBeenCalledTimes(1);
    expect(provider.createOrder).toHaveBeenCalledTimes(1);
    expect(store.markIndeterminate).toHaveBeenCalledWith(identifiers.attempt);
  });

  it("keeps malformed input distinct and settled single-use links unavailable", async () => {
    const { service, provider, store } = harness({ kind: "created", attempt: attempt(), ownerId: identifiers.owner, amount: "12.50", currencyUuid: "550e8400-e29b-41d4-a716-446655440055", exchangeCurrencyUuid: "660e8400-e29b-41d4-a716-446655440066" });
    await expect(service.checkout(identifiers.link, { idempotencyKey: "short", customer })).resolves.toEqual({ kind: "invalid" });
    expect(store.reserve).not.toHaveBeenCalled();
    store.reserve.mockResolvedValueOnce({ kind: "unavailable" });
    await expect(service.checkout(identifiers.link, { idempotencyKey: "retry-key-with-enough-entropy", customer })).resolves.toEqual({ kind: "unavailable" });
    expect(provider.quote).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
  });

  it("keeps pre-dispatch provider failures redacted", async () => {
    const { service, provider, store } = harness({ kind: "created", attempt: attempt(), ownerId: identifiers.owner, amount: "12.50", currencyUuid: "550e8400-e29b-41d4-a716-446655440055", exchangeCurrencyUuid: "660e8400-e29b-41d4-a716-446655440066" });
    provider.quote.mockRejectedValueOnce(new Error("provider body must not escape"));
    await expect(service.checkout(identifiers.link, { idempotencyKey: "retry-key-with-enough-entropy", customer })).resolves.toEqual({ kind: "provider-unavailable" });
    expect(store.markIndeterminate).toHaveBeenCalledWith(identifiers.attempt);
  });

  it("rejects an already claimed single-use link after locking it", async () => {
    const paymentLinkOrder = { create: vi.fn() };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: identifiers.link, ownerId: identifiers.owner, productId: "770e8400-e29b-41d4-a716-446655440077", productPrice: "12.50", currencyUuid: "550e8400-e29b-41d4-a716-446655440055", exchangeCurrencyUuid: "660e8400-e29b-41d4-a716-446655440066", checkoutDataPolicy: "NONE", expiresAt: null, linkType: "SINGLE_USE" }]),
      paymentLinkSingleUseSettlement: { findUnique: vi.fn().mockResolvedValue({ paymentLinkId: identifiers.link }) },
      paymentLinkOrder,
    };
    const store = createPrismaCheckoutStore({ $transaction: vi.fn((work) => work(tx)) } as never, key);

    await expect(store.reserve({ identifier: identifiers.link, retryKey: "retry-key-with-enough-entropy", customer, now })).resolves.toEqual({ kind: "unavailable" });
    expect(tx.paymentLinkSingleUseSettlement.findUnique).toHaveBeenCalledWith({ where: { paymentLinkId: identifiers.link }, select: { paymentLinkId: true } });
    expect(paymentLinkOrder.create).not.toHaveBeenCalled();
  });
});

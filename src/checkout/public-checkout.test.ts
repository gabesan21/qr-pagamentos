import { createHash, createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createPublicCheckoutService } from "./public-checkout";

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
  const store = { reserve: vi.fn().mockResolvedValue(reservation), markCreating: vi.fn().mockResolvedValue(true), markPending: vi.fn().mockResolvedValue(pending), markIndeterminate: vi.fn().mockResolvedValue(undefined) };
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

  it("keeps malformed input distinct and provider ambiguity durable but redacted", async () => {
    const { service, provider, store } = harness({ kind: "created", attempt: attempt(), ownerId: identifiers.owner, amount: "12.50", currencyUuid: "550e8400-e29b-41d4-a716-446655440055", exchangeCurrencyUuid: "660e8400-e29b-41d4-a716-446655440066" });
    await expect(service.checkout(identifiers.link, { idempotencyKey: "short", customer })).resolves.toEqual({ kind: "invalid" });
    expect(store.reserve).not.toHaveBeenCalled();
    provider.quote.mockRejectedValueOnce(new Error("provider body must not escape"));
    await expect(service.checkout(identifiers.link, { idempotencyKey: "retry-key-with-enough-entropy", customer })).resolves.toEqual({ kind: "provider-unavailable" });
    expect(store.markIndeterminate).toHaveBeenCalledWith(identifiers.attempt);
  });
});

import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseRejectedWebhookIdentity, parseWebhookEnvelope } from "./webhook-envelope";
import { createInMemoryWebhookDeliveryStore, type WebhookDeliveryStore } from "./webhook-delivery-store";
import { createWebhookIntake, type WebhookOrderReconciler } from "./webhook-intake";
import { createOwnerPricingOrdersService } from "./owner-pricing-orders";
import { createInMemoryProviderOrderStore, type ProviderOrderStore } from "./provider-order-store";
import type { NauttOrderView } from "./pricing-orders-client";

const ownerId = "550e8400-e29b-41d4-a716-446655440010";
const delivery = "550e8400-e29b-41d4-a716-446655440011";
const order = "550e8400-e29b-41d4-a716-446655440012";
const secret = "webhook-secret";
const body = Buffer.from(JSON.stringify({ id: delivery, event: "order.paid", created_at: "2026-07-17T20:00:00Z", data: { uuid: order, status: "paid" } }));
const validSignature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function harness(options: {
  reconcile?: WebhookOrderReconciler["reconcileWebhookOrder"];
  candidates?: readonly { ownerId: string; secret: string }[];
  deliveryStore?: WebhookDeliveryStore;
  now?: () => Date;
} = {}) {
  const backingStore = options.deliveryStore ?? createInMemoryWebhookDeliveryStore();
  const deliveryStore = {
    claim: vi.fn(backingStore.claim.bind(backingStore)),
    bindOrder: vi.fn(backingStore.bindOrder.bind(backingStore)),
    finalize: vi.fn(backingStore.finalize.bind(backingStore)),
  } satisfies WebhookDeliveryStore;
  const apiKeyDecrypt = vi.fn().mockResolvedValue("owner-api-key");
  const providerFetch = vi.fn().mockResolvedValue({ status: "processing" });
  const reconcile = options.reconcile ?? vi.fn(async () => {
    await apiKeyDecrypt();
    await providerFetch();
    return { kind: "processed" as const, localOrderId: "550e8400-e29b-41d4-a716-446655440013" };
  });
  const candidateValues = options.candidates ?? [{ ownerId, secret }];
  const loadCandidates = vi.fn(async () => candidateValues.map((candidate) => ({ ownerId: candidate.ownerId, secret: Buffer.from(candidate.secret) })));
  const parseEnvelope = vi.fn(parseWebhookEnvelope);
  const parseRejectedIdentity = vi.fn(parseRejectedWebhookIdentity);
  const intake = createWebhookIntake({
    deliveryStore,
    loadCandidates,
    orderReconciler: { reconcileWebhookOrder: reconcile },
    now: options.now,
    parseEnvelope,
    parseRejectedIdentity,
  });
  return { intake, reconcile, loadCandidates, parseEnvelope, parseRejectedIdentity, deliveryStore, apiKeyDecrypt, providerFetch };
}

describe("webhook intake authentication", () => {
  it.each([null, "sha256=bad", `sha256=${"0".repeat(64)}`])("rejects without parse/write/fetch side effects: %s", async (signature) => {
    const effects = harness();
    const { intake, reconcile, loadCandidates } = effects;
    await expect(intake({ rawBody: body, signature, delivery, event: "order.paid" })).resolves.toEqual({ status: 401 });
    if (signature === null || signature === "sha256=bad") expect(loadCandidates).not.toHaveBeenCalled();
    expect(effects.parseEnvelope).not.toHaveBeenCalled();
    expect(effects.parseRejectedIdentity).not.toHaveBeenCalled();
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.deliveryStore.bindOrder).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.apiKeyDecrypt).not.toHaveBeenCalled();
    expect(effects.providerFetch).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("rejects multiple matching owners without reconciliation", async () => {
    const effects = harness({ candidates: [{ ownerId, secret }, { ownerId: "550e8400-e29b-41d4-a716-446655440099", secret }] });
    const { intake, reconcile } = effects;
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 401 });
    expect(effects.parseEnvelope).not.toHaveBeenCalled();
    expect(effects.parseRejectedIdentity).not.toHaveBeenCalled();
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.deliveryStore.bindOrder).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.apiKeyDecrypt).not.toHaveBeenCalled();
    expect(effects.providerFetch).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });
});

describe("webhook intake decisions, deadline, capacity, and cost", () => {
  it("durably rejects an authenticated contradictory envelope without a provider read", async () => {
    const contradictory = Buffer.from(JSON.stringify({ id: "550e8400-e29b-41d4-a716-446655440099", event: "order.paid", created_at: "2026-07-17T20:00:00Z", data: { uuid: order } }));
    const contradictorySignature = `sha256=${createHmac("sha256", secret).update(contradictory).digest("hex")}`;
    const { intake, reconcile } = harness();
    await expect(intake({ rawBody: contradictory, signature: contradictorySignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 400 });
    await expect(intake({ rawBody: contradictory, signature: contradictorySignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 400 });
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("processes once, then acknowledges a durable duplicate with zero GET", async () => {
    const { intake, reconcile } = harness();
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });
    expect(reconcile).toHaveBeenCalledTimes(1);
  });

  it("returns 503 for a live lease without reconciliation, API-key decryption, or provider fetch", async () => {
    const now = new Date("2026-07-17T20:00:01Z");
    const deliveryStore = createInMemoryWebhookDeliveryStore();
    await deliveryStore.claim({
      deliveryUuid: delivery,
      ownerId,
      providerOrderUuid: order,
      eventType: "order.paid",
      providerCreatedAt: new Date("2026-07-17T20:00:00Z"),
      providerAttemptNumber: null,
      payloadDigest: createHash("sha256").update(body).digest("hex"),
      now,
      leaseExpiresAt: new Date("2026-07-17T20:00:15Z"),
    });
    const effects = harness({ deliveryStore, now: () => now });

    await expect(effects.intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 503 });

    expect(effects.deliveryStore.claim).toHaveBeenCalledOnce();
    expect(effects.deliveryStore.bindOrder).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
    expect(effects.apiKeyDecrypt).not.toHaveBeenCalled();
    expect(effects.providerFetch).not.toHaveBeenCalled();
  });

  it("durably ignores an unknown/final owner-bound order with zero provider GET", async () => {
    const reconcile = vi.fn().mockResolvedValue({ kind: "ignored" });
    const { intake } = harness({ reconcile });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it("excludes notification status from the authoritative reconciliation mutation", async () => {
    const quoteUuid = "550e8400-e29b-41d4-a716-446655440020";
    const providerStore = createInMemoryProviderOrderStore();
    await providerStore.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-17T21:00:00Z") });
    const claimed = await providerStore.claimForCreation({ quoteUuid, ownerId, now: new Date("2026-07-17T20:00:00Z") });
    if (claimed.kind !== "claimed") throw new Error("provider order fixture claim failed");
    const initial: NauttOrderView = {
      orderUuid: order,
      status: "new",
      fiatAmount: "100.00",
      cryptoAmount: "20.00",
      nauttQuote: "5.00",
      expiresAt: new Date("2026-07-17T21:00:00Z"),
      paymentMethod: "pix",
    };
    await providerStore.completeCreation(claimed.attempt, initial);
    const reconcileMutation = vi.fn(providerStore.reconcile.bind(providerStore));
    const observedStore = { ...providerStore, reconcile: reconcileMutation } satisfies ProviderOrderStore;
    const authoritative = { ...initial, status: "processing" as const };
    const getOrder = vi.fn().mockResolvedValue(authoritative);
    const apiKeyDecrypt = vi.fn().mockResolvedValue("owner-api-key");
    const service = createOwnerPricingOrdersService(
      { getDecryptedApiKey: apiKeyDecrypt },
      { createQuote: vi.fn(), createOnrampOrder: vi.fn(), getOrder },
      observedStore,
    );
    const notification = Buffer.from(JSON.stringify({
      id: delivery,
      event: "order.completed",
      created_at: "2026-07-17T20:00:00Z",
      data: { uuid: order, status: "finished" },
    }));
    const notificationSignature = `sha256=${createHmac("sha256", secret).update(notification).digest("hex")}`;
    const effects = harness({ reconcile: service.reconcileWebhookOrder.bind(service) });

    await expect(effects.intake({ rawBody: notification, signature: notificationSignature, delivery, event: "order.completed" })).resolves.toEqual({ status: 204 });

    expect(apiKeyDecrypt).toHaveBeenCalledOnce();
    expect(getOrder).toHaveBeenCalledWith({ apiKey: "owner-api-key", orderUuid: order });
    expect(reconcileMutation).toHaveBeenCalledWith(expect.objectContaining({ status: "new" }), authoritative);
    expect(reconcileMutation).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "finished" }));
  });

  it("marks a provider failure retryable and performs at most one reconciliation per attempt", async () => {
    const reconcile = vi.fn().mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValueOnce({ kind: "ignored" });
    const { intake } = harness({ reconcile });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 503 });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("checks 1,000 candidates and leaves more than 500ms around an injected 10s GET", async () => {
    const candidates = Array.from({ length: 1_000 }, (_, index) => ({ ownerId: `owner-${index}`, secret: index === 999 ? secret : `wrong-${index}` }));
    candidates[999] = { ownerId, secret };
    const start = performance.now();
    const { intake, reconcile } = harness({ candidates });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });
    const localWorkMs = performance.now() - start;
    expect(localWorkMs + 10_000).toBeLessThan(14_500);
    expect(reconcile).toHaveBeenCalledOnce();
  });
});

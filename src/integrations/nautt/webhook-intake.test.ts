import { createHash, createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { logWebhookRejection } = vi.hoisted(() => ({ logWebhookRejection: vi.fn() }));
vi.mock("../../observability/webhook-rejection-log", () => ({ logWebhookRejection }));

import { createInMemoryWebhookDeliveryStore, type WebhookDeliveryStore } from "./webhook-delivery-store";
import {
  createWebhookIntake,
  WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS,
  WEBHOOK_PROCESSING_LEASE_MS,
  type WebhookOrderReconciler,
} from "./webhook-intake";
import { createOwnerPricingOrdersService } from "./owner-pricing-orders";
import { createInMemoryProviderOrderStore, type ProviderOrderStore } from "./provider-order-store";
import type { NauttOrderView } from "./pricing-orders-client";

const ownerId = "550e8400-e29b-41d4-a716-446655440010";
const delivery = "550e8400-e29b-41d4-a716-446655440011";
const order = "550e8400-e29b-41d4-a716-446655440012";
const secret = "nautt_whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const sign = (rawBody: Buffer, key = secret) => `sha256=${createHmac("sha256", key).update(rawBody).digest("hex")}`;
const body = Buffer.from(JSON.stringify({ id: delivery, event: "order.paid", created_at: "2026-07-17T20:00:00Z", data: { uuid: order, status: "paid" } }));
const validSignature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const productionBody = Buffer.from('{"created_at":"2026-10-07T18:45:07.219896736+00:00","data":{"status":"finished","uuid":"4b72dc46-3335-4953-940d-0fc902505ce6"},"event":"order.completed","id":"53622c3f-f5ec-4ac0-95db-e7ea0edce2be"}');
const productionDelivery = "53622c3f-f5ec-4ac0-95db-e7ea0edce2be";
const productionOrder = "4b72dc46-3335-4953-940d-0fc902505ce6";
const productionSignature = `sha256=${createHmac("sha256", secret).update(productionBody).digest("hex")}`;

function harness(options: {
  reconcile?: WebhookOrderReconciler["reconcileWebhookOrder"];
  repair?: WebhookOrderReconciler["repairWebhookSettlement"];
  ownerId?: string | null;
  deliveryStore?: WebhookDeliveryStore;
  now?: () => Date;
  resolveOrderOwner?: (providerOrderUuid: string) => Promise<string | null>;
  loadOwnerWebhookSecret?: (ownerId: string) => Promise<Buffer | null>;
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
  const repair = options.repair ?? vi.fn(async () => ({ kind: "processed" as const, localOrderId: "550e8400-e29b-41d4-a716-446655440013" }));
  const resolveOrderOwner = vi.fn(options.resolveOrderOwner ?? (async () => options.ownerId === undefined ? ownerId : options.ownerId));
  const loadOwnerWebhookSecret = vi.fn(options.loadOwnerWebhookSecret ?? (async () => Buffer.from(secret)));
  const intake = createWebhookIntake({
    deliveryStore,
    resolveOrderOwner,
    loadOwnerWebhookSecret,
    orderReconciler: { reconcileWebhookOrder: reconcile, repairWebhookSettlement: repair },
    now: options.now,
  });
  return { intake, reconcile, repair, resolveOrderOwner, loadOwnerWebhookSecret, deliveryStore, apiKeyDecrypt, providerFetch };
}

describe("webhook intake persisted UUID routing with owner-bound authentication", () => {
  afterEach(() => logWebhookRejection.mockClear());

  it.each([
    [null, "missing"], ["", "malformed"], ["sha256=bad", "malformed"],
    [`sha256=${"0".repeat(64)}`, "unmatched"],
    [`sha256=${"A".repeat(64)}`, "malformed"],
    [`${validSignature}\n`, "malformed"],
  ] as const)("rejects known orders before effects: %s", async (signature, reason) => {
    const effects = harness();
    await expect(effects.intake({ rawBody: body, signature })).resolves.toEqual({ status: 401 });
    expect(effects.resolveOrderOwner).toHaveBeenCalledWith(order);
    expect(logWebhookRejection).toHaveBeenCalledExactlyOnceWith(reason, delivery, "order.paid");
    expect(effects.loadOwnerWebhookSecret).toHaveBeenCalledTimes(reason === "unmatched" ? 1 : 0);
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.deliveryStore.bindOrder).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
    expect(effects.repair).not.toHaveBeenCalled();
    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });
    expect(effects.reconcile).toHaveBeenCalledOnce();
  });

  it("rejects another owner's key despite forged notification owner fields", async () => {
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(body.toString()), ownerId: "attacker", user_uuid: ownerId }));
    const effects = harness({ loadOwnerWebhookSecret: async () => Buffer.from("persisted-owner-secret") });
    await expect(effects.intake({ rawBody: forged, signature: sign(forged) })).resolves.toEqual({ status: 401 });
    expect(effects.loadOwnerWebhookSecret).toHaveBeenCalledExactlyOnceWith(ownerId);
    expect(effects.reconcile).not.toHaveBeenCalled();
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
  });

  it.each([null, "failure"] as const)("fails closed for secret configuration %s", async (outcome) => {
    const effects = harness({ loadOwnerWebhookSecret: async () => {
      if (outcome === "failure") throw new Error("private operational detail");
      return null;
    } });
    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: outcome === null ? 401 : 503 });
    expect(logWebhookRejection).toHaveBeenCalledTimes(outcome === null ? 1 : 0);
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
    expect(effects.repair).not.toHaveBeenCalled();
  });

  it("wipes each disposable signing buffer, including mismatched authentication", async () => {
    const keys: Buffer[] = [];
    const effects = harness({ loadOwnerWebhookSecret: async () => {
      const key = Buffer.from(secret);
      keys.push(key);
      return key;
    } });
    await effects.intake({ rawBody: body, signature: sign(body, "wrong-owner") });
    await effects.intake({ rawBody: body, signature: validSignature });
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    for (const key of keys) expect(key).toEqual(Buffer.alloc(key.length));
  });
  it("returns 503 without auth logging when real verification unexpectedly throws", async () => {
    const key = Buffer.from(secret);
    vi.spyOn(key, "fill").mockImplementation(() => { throw new Error("cleanup failed"); });
    const effects = harness({ loadOwnerWebhookSecret: async () => key });
    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 503 });
    expect(logWebhookRejection).not.toHaveBeenCalled();
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.deliveryStore.bindOrder).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
    expect(effects.repair).not.toHaveBeenCalled();
    vi.mocked(key.fill).mockRestore();
    key.fill(0);
  });


  it("acknowledges an unknown UUID without claim, credential decryption, or provider network", async () => {
    const effects = harness({ ownerId: null });
    await expect(effects.intake({ rawBody: body, signature: null })).resolves.toEqual({ status: 204 });
    expect(effects.resolveOrderOwner).toHaveBeenCalledWith(order);
    expect(effects.loadOwnerWebhookSecret).not.toHaveBeenCalled();
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.deliveryStore.bindOrder).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.apiKeyDecrypt).not.toHaveBeenCalled();
    expect(effects.providerFetch).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before resolving ownership", async () => {
    const effects = harness();
    await expect(effects.intake({ rawBody: Buffer.from("{"), signature: null })).resolves.toEqual({ status: 400 });
    expect(effects.resolveOrderOwner).not.toHaveBeenCalled();
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
  });

  it("returns retryable failure when persisted ownership cannot be resolved", async () => {
    const effects = harness({ resolveOrderOwner: async () => { throw new Error("database unavailable"); } });
    await expect(effects.intake({ rawBody: body, signature: null })).resolves.toEqual({ status: 503 });
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
  });

  it("routes notification with malformed optional delivery evidence directly to reconciliation without claim or rejection", async () => {
    const rawBody = Buffer.from(JSON.stringify({
      id: "not-a-uuid", event: "order.unknown", created_at: "invalid-date",
      data: { uuid: order, webhook_deliveries: null },
    }));
    const effects = harness();
    await expect(effects.intake({ rawBody, signature: sign(rawBody) })).resolves.toEqual({ status: 204 });
    expect(effects.resolveOrderOwner).toHaveBeenCalledWith(order);
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.reconcile).toHaveBeenCalledWith(ownerId, order);
    expect(logWebhookRejection).not.toHaveBeenCalled();
  });

  it("acknowledges unknown UUID without claim or reconciliation even when optional metadata is invalid", async () => {
    const rawBody = Buffer.from(JSON.stringify({
      id: "not-a-uuid", event: "order.unknown", created_at: "invalid-date",
      data: { uuid: order },
    }));
    const effects = harness({ ownerId: null });
    await expect(effects.intake({ rawBody, signature: null })).resolves.toEqual({ status: 204 });
    expect(effects.resolveOrderOwner).toHaveBeenCalledWith(order);
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
    expect(logWebhookRejection).not.toHaveBeenCalled();
  });

  it.each(["direct", "conflict", "terminal"] as const)("authenticates before the %s branch and preserves a valid retry", async (branch) => {
    const backingStore = createInMemoryWebhookDeliveryStore();
    if (branch === "conflict") {
      await backingStore.claim({
        deliveryUuid: delivery, ownerId: "other-owner", providerOrderUuid: productionOrder,
        eventType: "order.paid", providerCreatedAt: new Date("2026-07-17T20:00:00Z"),
        providerAttemptNumber: null, payloadDigest: "d".repeat(64),
        now: new Date("2026-07-17T20:00:00Z"), leaseExpiresAt: new Date("2026-07-17T20:00:16Z"),
      });
    }
    const effects = harness({ deliveryStore: backingStore });
    if (branch === "terminal") await effects.intake({ rawBody: body, signature: validSignature });
    const rawBody = branch === "direct" ? Buffer.from(JSON.stringify({ data: { uuid: order } })) : body;
    const beforeClaims = effects.deliveryStore.claim.mock.calls.length;
    const beforeReconcile = vi.mocked(effects.reconcile).mock.calls.length;
    const beforeFinalize = effects.deliveryStore.finalize.mock.calls.length;
    await expect(effects.intake({ rawBody, signature: sign(rawBody, "wrong-owner") })).resolves.toEqual({ status: 401 });
    expect(effects.deliveryStore.claim).toHaveBeenCalledTimes(beforeClaims);
    expect(effects.deliveryStore.finalize).toHaveBeenCalledTimes(beforeFinalize);
    expect(effects.reconcile).toHaveBeenCalledTimes(beforeReconcile);
    expect(effects.repair).not.toHaveBeenCalled();
    expect(logWebhookRejection).toHaveBeenCalledExactlyOnceWith("unmatched", branch === "direct" ? null : delivery, branch === "direct" ? null : "order.paid");
    await expect(effects.intake({ rawBody, signature: sign(rawBody) })).resolves.toEqual({ status: 204 });
    if (branch === "terminal") expect(effects.repair).toHaveBeenCalledOnce();
    else expect(effects.reconcile).toHaveBeenCalledTimes(beforeReconcile + 1);
  });

  it("rejects tampered completed-delivery bytes before local repair", async () => {
    const effects = harness();
    await effects.intake({ rawBody: body, signature: validSignature });
    const altered = Buffer.from(body.toString().replace('"paid"', '"finished"'));
    await expect(effects.intake({ rawBody: altered, signature: validSignature })).resolves.toEqual({ status: 401 });
    expect(effects.repair).not.toHaveBeenCalled();
    expect(effects.deliveryStore.claim).toHaveBeenCalledOnce();
    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });
    expect(effects.repair).toHaveBeenCalledOnce();
  });

  it("ignores changed non-identity payload bytes on a processed delivery and calls repairWebhookSettlement with zero provider GET", async () => {
    const effects = harness();
    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });
    const altered = Buffer.from(body.toString().replace('"paid"', '"finished"'));
    await expect(effects.intake({ rawBody: altered, signature: sign(altered) })).resolves.toEqual({ status: 204 });
    expect(effects.reconcile).toHaveBeenCalledOnce();
    expect(effects.repair).toHaveBeenCalledOnce();
    expect(effects.deliveryStore.finalize).toHaveBeenCalledOnce();
  });

  it("handles delivery conflict by reconciling the target owner directly without overwriting occupied delivery evidence", async () => {
    const deliveryStore = createInMemoryWebhookDeliveryStore();
    // Occupy delivery with another owner/order
    await deliveryStore.claim({
      deliveryUuid: delivery,
      ownerId: "550e8400-e29b-41d4-a716-446655440099",
      providerOrderUuid: "550e8400-e29b-41d4-a716-446655440098",
      eventType: "order.paid",
      providerCreatedAt: new Date("2026-07-17T20:00:00Z"),
      providerAttemptNumber: null,
      payloadDigest: "d".repeat(64),
      now: new Date("2026-07-17T20:00:00Z"),
      leaseExpiresAt: new Date("2026-07-17T20:00:15Z"),
    });

    const effects = harness({ deliveryStore });
    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });
    expect(effects.reconcile).toHaveBeenCalledWith(ownerId, order);
    expect(logWebhookRejection).not.toHaveBeenCalled();
  });
});

describe("webhook intake decisions, deadline, capacity, and cost", () => {
describe("body-canonical production completion", () => {
  it("accepts valid notification and deduplicates duplicate delivery with local repair", async () => {
    const effects = harness();
    const request = { rawBody: productionBody, signature: productionSignature };
    await expect(effects.intake(request)).resolves.toEqual({ status: 204 });
    await expect(effects.intake(request)).resolves.toEqual({ status: 204 });
    expect(effects.deliveryStore.claim).toHaveBeenCalledWith(expect.objectContaining({
      deliveryUuid: productionDelivery, providerOrderUuid: productionOrder, eventType: "order.completed",
      providerCreatedAt: new Date("2026-10-07T18:45:07.219Z"),
    }));
    expect(effects.deliveryStore.finalize).toHaveBeenCalledOnce();
    expect(effects.reconcile).toHaveBeenCalledOnce();
    expect(effects.repair).toHaveBeenCalledOnce();
  });

  it.each([
    ["non-json body", Buffer.from("not-json"), "invalid_json"],
    ["missing data", Buffer.from(JSON.stringify({ id: productionDelivery })), "schema_invalid"],
    ["missing order uuid", Buffer.from(JSON.stringify({ data: { status: "finished" } })), "schema_invalid"],
    ["invalid order uuid", Buffer.from(JSON.stringify({ data: { uuid: "not-a-uuid" } })), "schema_invalid"],
  ])("rejects unrouteable %s with 400 and diagnostic log", async (_name, rawBody, expectedReason) => {
    const effects = harness();
    await expect(effects.intake({ rawBody, signature: null })).resolves.toEqual({ status: 400 });
    expect(logWebhookRejection).toHaveBeenCalledWith(expectedReason, null, null);
    expect(effects.reconcile).not.toHaveBeenCalled();
  });

  it("reclaims historical REJECTED delivery row and completes reconciliation", async () => {
    const deliveryStore = createInMemoryWebhookDeliveryStore();
    const claim = await deliveryStore.claim({
      deliveryUuid: productionDelivery,
      ownerId,
      providerOrderUuid: productionOrder,
      eventType: "order.completed",
      providerCreatedAt: new Date("2026-10-07T18:45:07.219Z"),
      providerAttemptNumber: null,
      payloadDigest: "e".repeat(64),
      now: new Date("2026-10-07T18:45:00Z"),
      leaseExpiresAt: new Date("2026-10-07T18:45:10Z"),
    });
    if (claim.kind !== "claimed") throw new Error("setup claim failed");
    await deliveryStore.finalize({
      deliveryUuid: productionDelivery,
      attemptNumber: claim.attemptNumber,
      decision: "REJECTED",
      now: new Date("2026-10-07T18:45:01Z"),
    });

    const effects = harness({ deliveryStore });
    await expect(effects.intake({ rawBody: productionBody, signature: productionSignature })).resolves.toEqual({ status: 204 });
    expect(effects.reconcile).toHaveBeenCalledWith(ownerId, productionOrder);
  });
});

  it("processes once, then acknowledges a durable duplicate with zero GET and runs repair", async () => {
    const { intake, reconcile, repair } = harness();
    await expect(intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });
    await expect(intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(repair).toHaveBeenCalledTimes(1);
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

    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 503 });

    expect(effects.deliveryStore.claim).toHaveBeenCalledOnce();
    expect(effects.deliveryStore.bindOrder).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
    expect(effects.apiKeyDecrypt).not.toHaveBeenCalled();
    expect(effects.providerFetch).not.toHaveBeenCalled();
  });

  it("keeps a boundary duplicate busy and reclaims only after the safe processing lease", async () => {
    const startedAt = new Date("2026-07-17T20:00:00Z");
    let currentTime = startedAt;
    let releaseHeld!: (value: { kind: "ignored" }) => void;
    const held = new Promise<{ kind: "ignored" }>((resolve) => { releaseHeld = resolve; });
    const providerGet = vi.fn()
      .mockImplementationOnce(() => held)
      .mockResolvedValue({ kind: "ignored" });
    const deliveryStore = createInMemoryWebhookDeliveryStore();
    const effects = harness({
      deliveryStore,
      now: () => currentTime,
      reconcile: providerGet,
    });

    const first = effects.intake({ rawBody: body, signature: validSignature });
    await vi.waitFor(() => expect(providerGet).toHaveBeenCalledOnce());

    currentTime = new Date(startedAt.getTime() + WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS - 1);
    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 503 });
    expect(providerGet).toHaveBeenCalledOnce();

    currentTime = new Date(startedAt.getTime() + WEBHOOK_PROCESSING_LEASE_MS + 1);
    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });
    expect(providerGet).toHaveBeenCalledTimes(2);

    releaseHeld({ kind: "ignored" });
    await expect(first).resolves.toEqual({ status: 503 });
  });

  it("durably ignores an unknown/final owner-bound order with zero provider GET", async () => {
    const reconcile = vi.fn().mockResolvedValue({ kind: "ignored" });
    const { intake } = harness({ reconcile });
    await expect(intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });
    expect(reconcile).toHaveBeenCalledOnce();
  });

  it.each(["processing", "finished"] as const)("uses the owner-bound provider GET for authoritative %s state, never the notification", async (providerStatus) => {
    const quoteUuid = "550e8400-e29b-41d4-a716-446655440020";
    const providerStore = createInMemoryProviderOrderStore();
    await providerStore.register({ quoteUuid, ownerId, expiresAt: new Date("2026-07-17T21:00:00Z") });
    const claimed = await providerStore.claimForCreation({ quoteUuid, ownerId, now: new Date("2026-07-17T20:00:00Z") });
    if (claimed.kind !== "claimed") throw new Error("provider order fixture claim failed");
    const initial: NauttOrderView = {
      orderUuid: providerStatus === "finished" ? productionOrder : order,
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
    const authoritative = { ...initial, status: providerStatus };
    const getOrder = vi.fn().mockResolvedValue(authoritative);
    const apiKeyDecrypt = vi.fn().mockResolvedValue("owner-api-key");
    const service = createOwnerPricingOrdersService(
      { getDecryptedApiKey: apiKeyDecrypt },
      { createQuote: vi.fn(), createOnrampOrder: vi.fn(), getOrder },
      observedStore,
    );
    const notification = providerStatus === "finished" ? productionBody : Buffer.from(JSON.stringify({
      id: delivery,
      event: "order.completed",
      created_at: "2026-07-17T20:00:00Z",
      data: { uuid: order, status: "finished" },
    }));
    const notificationSignature = `sha256=${createHmac("sha256", secret).update(notification).digest("hex")}`;
    const effects = harness({ reconcile: service.reconcileWebhookOrder.bind(service) });

    await expect(effects.intake({ rawBody: notification, signature: notificationSignature })).resolves.toEqual({ status: 204 });

    expect(apiKeyDecrypt).toHaveBeenCalledOnce();
    expect(getOrder).toHaveBeenCalledWith({ apiKey: "owner-api-key", orderUuid: initial.orderUuid });
    expect(reconcileMutation).toHaveBeenCalledWith(expect.objectContaining({ status: "new" }), authoritative);
    await expect(reconcileMutation.mock.results[0]?.value).resolves.toEqual(expect.objectContaining({ status: providerStatus }));
    if (providerStatus === "processing") expect(reconcileMutation).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "finished" }));
  });

  it("marks a provider failure retryable and performs at most one reconciliation per attempt", async () => {
    const reconcile = vi.fn().mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValueOnce({ kind: "ignored" });
    const { intake } = harness({ reconcile });
    await expect(intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 503 });
    await expect(intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("keeps UUID resolution, a 10s GET, and durable work below the processing budget", async () => {
    let elapsedMs = 0;
    const resolveOrderOwner = vi.fn(async () => {
      elapsedMs += 10;
      return ownerId;
    });
    const persisted = createInMemoryWebhookDeliveryStore();
    const durableEvidence = { claims: 0, binds: 0, finalizes: 0 };
    const timedStore: WebhookDeliveryStore = {
      async claim(input) {
        const result = await persisted.claim(input);
        durableEvidence.claims += 1;
        elapsedMs += 250;
        return result;
      },
      async bindOrder(deliveryUuid, boundOwnerId, localOrderId) {
        await persisted.bindOrder(deliveryUuid, boundOwnerId, localOrderId);
        durableEvidence.binds += 1;
        elapsedMs += 100;
      },
      async finalize(input) {
        await persisted.finalize(input);
        durableEvidence.finalizes += 1;
        elapsedMs += 250;
      },
    };
    const providerGet = vi.fn(async () => {
      elapsedMs += 10_000;
      return { kind: "processed" as const, localOrderId: "550e8400-e29b-41d4-a716-446655440013" };
    });
    const epoch = Date.parse("2026-07-17T20:00:00Z");
    const effects = harness({
      deliveryStore: timedStore,
      resolveOrderOwner,
      reconcile: providerGet,
      now: () => new Date(epoch + elapsedMs),
    });

    await expect(effects.intake({ rawBody: body, signature: validSignature })).resolves.toEqual({ status: 204 });

    expect(resolveOrderOwner).toHaveBeenCalledOnce();
    expect(providerGet).toHaveBeenCalledOnce();
    expect(durableEvidence).toEqual({ claims: 1, binds: 1, finalizes: 1 });
    expect(elapsedMs).toBe(10_610);
    expect(elapsedMs).toBeLessThan(WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS);
  });
});

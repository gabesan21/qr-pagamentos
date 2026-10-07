import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { logWebhookRejection } = vi.hoisted(() => ({ logWebhookRejection: vi.fn() }));
vi.mock("../../observability/webhook-rejection-log", () => ({ logWebhookRejection }));

import { parseRejectedWebhookIdentity, parseWebhookEnvelope } from "./webhook-envelope";
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
import { decrypt, encrypt } from "../../lib/nautt-crypto";
import { createWebhookSecretCandidateLoader } from "./webhook-secret-candidates";
import { verifyWebhookOwner } from "./webhook-signature";

const ownerId = "550e8400-e29b-41d4-a716-446655440010";
const delivery = "550e8400-e29b-41d4-a716-446655440011";
const order = "550e8400-e29b-41d4-a716-446655440012";
const secret = "webhook-secret";
const body = Buffer.from(JSON.stringify({ id: delivery, event: "order.paid", created_at: "2026-07-17T20:00:00Z", data: { uuid: order, status: "paid" } }));
const validSignature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const productionBody = Buffer.from('{"created_at":"2026-10-07T18:45:07.219896736+00:00","data":{"status":"finished","uuid":"4b72dc46-3335-4953-940d-0fc902505ce6"},"event":"order.completed","id":"53622c3f-f5ec-4ac0-95db-e7ea0edce2be"}');
const productionDelivery = "53622c3f-f5ec-4ac0-95db-e7ea0edce2be";
const productionOrder = "4b72dc46-3335-4953-940d-0fc902505ce6";
const productionSignature = `sha256=${createHmac("sha256", secret).update(productionBody).digest("hex")}`;

function harness(options: {
  reconcile?: WebhookOrderReconciler["reconcileWebhookOrder"];
  candidates?: readonly { ownerId: string; secret: string }[];
  deliveryStore?: WebhookDeliveryStore;
  now?: () => Date;
  loadCandidates?: () => Promise<readonly { ownerId: string; secret: Buffer }[]>;
  verifyOwner?: typeof verifyWebhookOwner;
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
  const loadCandidates = vi.fn(options.loadCandidates ?? (async () => candidateValues.map((candidate) => ({ ownerId: candidate.ownerId, secret: Buffer.from(candidate.secret) }))));
  const parseEnvelope = vi.fn(parseWebhookEnvelope);
  const parseRejectedIdentity = vi.fn(parseRejectedWebhookIdentity);
  const intake = createWebhookIntake({
    deliveryStore,
    loadCandidates,
    orderReconciler: { reconcileWebhookOrder: reconcile },
    now: options.now,
    parseEnvelope,
    parseRejectedIdentity,
    verifyOwner: options.verifyOwner,
  });
  return { intake, reconcile, loadCandidates, parseEnvelope, parseRejectedIdentity, deliveryStore, apiKeyDecrypt, providerFetch };
}

describe("webhook intake authentication", () => {
  afterEach(() => logWebhookRejection.mockClear());

  it.each([
    [null, "missing"],
    ["sha256=bad", "malformed"],
    [`sha256=${"0".repeat(64)}`, "unmatched"],
  ] as const)("rejects without parse/write/fetch side effects: %s", async (signature, reason) => {
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
    expect(logWebhookRejection).toHaveBeenCalledOnce();
    expect(logWebhookRejection).toHaveBeenCalledWith(reason, delivery, "order.paid");
  });

  it.each([null, `sha256=${"0".repeat(64)}`])("rejects unauthenticated headerless production bytes before parse/write/GET: %s", async (signature) => {
    const effects = harness();
    await expect(effects.intake({ rawBody: productionBody, signature, delivery: null, event: null })).resolves.toEqual({ status: 401 });
    expect(effects.parseEnvelope).not.toHaveBeenCalled();
    expect(effects.parseRejectedIdentity).not.toHaveBeenCalled();
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.deliveryStore.bindOrder).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).not.toHaveBeenCalled();
    expect(effects.apiKeyDecrypt).not.toHaveBeenCalled();
    expect(effects.providerFetch).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
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
    expect(logWebhookRejection).toHaveBeenCalledOnce();
    expect(logWebhookRejection).toHaveBeenCalledWith("unmatched", delivery, "order.paid");
  });

  it("writes no rejection record when the secret loader fails", async () => {
    const effects = harness({ loadCandidates: async () => { throw new Error("decryption key unavailable"); } });
    await expect(effects.intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 503 });
    expect(logWebhookRejection).not.toHaveBeenCalled();
  });
});

describe("webhook intake decisions, deadline, capacity, and cost", () => {
describe("body-canonical production completion", () => {
  it.each([
    ["both absent", null, null],
    ["delivery absent", null, "order.completed"],
    ["event absent", productionDelivery, null],
    ["both matching", productionDelivery, "order.completed"],
  ])("accepts %s headers and durably deduplicates exact signed bytes", async (_name, deliveryHeader, eventHeader) => {
    const effects = harness();
    const request = { rawBody: productionBody, signature: productionSignature, delivery: deliveryHeader, event: eventHeader };
    await expect(effects.intake(request)).resolves.toEqual({ status: 204 });
    await expect(effects.intake(request)).resolves.toEqual({ status: 204 });
    expect(effects.deliveryStore.claim).toHaveBeenCalledWith(expect.objectContaining({
      deliveryUuid: productionDelivery, providerOrderUuid: productionOrder, eventType: "order.completed",
      providerCreatedAt: new Date("2026-10-07T18:45:07.219Z"),
    }));
    expect(effects.deliveryStore.finalize).toHaveBeenCalledOnce();
    expect(effects.reconcile).toHaveBeenCalledOnce();
    expect(effects.reconcile).toHaveBeenCalledWith(ownerId, productionOrder);
  });

  it.each([
    ["empty delivery", "", null],
    ["invalid delivery", "not-a-uuid", null],
    ["conflicting delivery", order, null],
    ["empty event", null, ""],
    ["invalid event", null, "order.unknown"],
    ["conflicting event", null, "order.paid"],
  ])("rejects present %s metadata", async (_name, deliveryHeader, eventHeader) => {
    const effects = harness();
    await expect(effects.intake({ rawBody: productionBody, signature: productionSignature, delivery: deliveryHeader, event: eventHeader })).resolves.toEqual({ status: 400 });
    expect(effects.reconcile).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid id", { id: "bad" }],
    ["invalid event", { event: "order.unknown" }],
    ["invalid order UUID", { data: { uuid: "bad", status: "finished" } }],
    ["invalid date", { created_at: "not-a-date" }],
    ["invalid attempt evidence", { data: { uuid: productionOrder, status: "finished", webhook_deliveries: [{ uuid: productionDelivery, order_uuid: productionOrder, event_type: "order.completed", attempt_number: 0 }] } }],
  ])("rejects authenticated %s in the body without provider GET", async (_name, override) => {
    const rawBody = Buffer.from(JSON.stringify({ created_at: "2026-10-07T18:45:07.219896736+00:00", data: { uuid: productionOrder, status: "finished" }, event: "order.completed", id: productionDelivery, ...override }));
    const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    const effects = harness();
    await expect(effects.intake({ rawBody, signature, delivery: null, event: null })).resolves.toEqual({ status: 400 });
    expect(effects.reconcile).not.toHaveBeenCalled();
  });

  it.each([
    [null, null],
    [productionDelivery, null],
    [null, "order.completed"],
  ])("durably rejects invalid attempt evidence with canonical absent-header identity", async (deliveryHeader, eventHeader) => {
    const rawBody = Buffer.from(JSON.stringify({
      id: productionDelivery, event: "order.completed", created_at: "2026-10-07T18:45:07.219896736+00:00",
      data: { uuid: productionOrder, webhook_deliveries: [{ uuid: productionDelivery, order_uuid: productionOrder, event_type: "order.completed", attempt_number: 0 }] },
    }));
    const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    const effects = harness();
    const request = { rawBody, signature, delivery: deliveryHeader, event: eventHeader };
    await expect(effects.intake(request)).resolves.toEqual({ status: 400 });
    await expect(effects.intake(request)).resolves.toEqual({ status: 400 });
    expect(effects.deliveryStore.claim).toHaveBeenCalledWith(expect.objectContaining({
      deliveryUuid: productionDelivery, eventType: "order.completed", providerOrderUuid: productionOrder,
    }));
    expect(effects.deliveryStore.finalize).toHaveBeenCalledOnce();
    expect(effects.deliveryStore.finalize).toHaveBeenCalledWith(expect.objectContaining({ decision: "REJECTED" }));
    expect(effects.reconcile).not.toHaveBeenCalled();
  });

  it("rejects a signature for altered bytes before parsing or mutating", async () => {
    const effects = harness();
    const altered = Buffer.from(productionBody.toString().replace('"finished"', '"processing"'));
    await expect(effects.intake({ rawBody: altered, signature: productionSignature, delivery: null, event: null })).resolves.toEqual({ status: 401 });
    expect(effects.parseEnvelope).not.toHaveBeenCalled();
    expect(effects.deliveryStore.claim).not.toHaveBeenCalled();
    expect(effects.reconcile).not.toHaveBeenCalled();
  });
});

  it("durably rejects an authenticated contradictory envelope without a provider read", async () => {
    const contradictory = Buffer.from(JSON.stringify({ id: "550e8400-e29b-41d4-a716-446655440099", event: "order.paid", created_at: "2026-07-17T20:00:00Z", data: { uuid: order } }));
    const contradictorySignature = `sha256=${createHmac("sha256", secret).update(contradictory).digest("hex")}`;
    const effects = harness();
    const { intake, reconcile } = effects;
    await expect(intake({ rawBody: contradictory, signature: contradictorySignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 400 });
    await expect(intake({ rawBody: contradictory, signature: contradictorySignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 400 });
    expect(reconcile).not.toHaveBeenCalled();
    expect(effects.deliveryStore.finalize).toHaveBeenCalledTimes(1);
    expect(effects.deliveryStore.finalize).toHaveBeenCalledWith(expect.objectContaining({ decision: "REJECTED" }));
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

    const first = effects.intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" });
    await vi.waitFor(() => expect(providerGet).toHaveBeenCalledOnce());

    currentTime = new Date(startedAt.getTime() + WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS - 1);
    await expect(effects.intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 503 });
    expect(providerGet).toHaveBeenCalledOnce();

    currentTime = new Date(startedAt.getTime() + WEBHOOK_PROCESSING_LEASE_MS + 1);
    await expect(effects.intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });
    expect(providerGet).toHaveBeenCalledTimes(2);

    releaseHeld({ kind: "ignored" });
    await expect(first).resolves.toEqual({ status: 503 });
  });

  it("durably ignores an unknown/final owner-bound order with zero provider GET", async () => {
    const reconcile = vi.fn().mockResolvedValue({ kind: "ignored" });
    const { intake } = harness({ reconcile });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });
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

    await expect(effects.intake({ rawBody: notification, signature: notificationSignature, delivery: providerStatus === "finished" ? null : delivery, event: providerStatus === "finished" ? null : "order.completed" })).resolves.toEqual({ status: 204 });

    expect(apiKeyDecrypt).toHaveBeenCalledOnce();
    expect(getOrder).toHaveBeenCalledWith({ apiKey: "owner-api-key", orderUuid: initial.orderUuid });
    expect(reconcileMutation).toHaveBeenCalledWith(expect.objectContaining({ status: "new" }), authoritative);
    await expect(reconcileMutation.mock.results[0]?.value).resolves.toEqual(expect.objectContaining({ status: providerStatus }));
    if (providerStatus === "processing") expect(reconcileMutation).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: "finished" }));
  });

  it("marks a provider failure retryable and performs at most one reconciliation per attempt", async () => {
    const reconcile = vi.fn().mockRejectedValueOnce(new Error("provider unavailable")).mockResolvedValueOnce({ kind: "ignored" });
    const { intake } = harness({ reconcile });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 503 });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("advances a production-equivalent 1,000-secret, 10s GET, and durable-work timeline below 14.5s", async () => {
    const encryptionKey = Buffer.alloc(32, 7);
    const encryptedRows = Array.from({ length: 1_000 }, (_, index) => ({
      ownerId: index === 999 ? ownerId : `owner-${index}`,
      encryptedWebhookSecret: encrypt(index === 999 ? secret : `wrong-${index}`, encryptionKey),
    }));
    let elapsedMs = 0;
    let decryptions = 0;
    let comparisons = 0;
    const loadCandidates = createWebhookSecretCandidateLoader(
      async () => encryptedRows,
      {
        loadKey: () => Buffer.from(encryptionKey),
        decryptSecret: (encrypted, key) => {
          decryptions += 1;
          elapsedMs += 1;
          return decrypt(encrypted, key);
        },
      },
    );
    const verifyOwner = (rawBody: Buffer, signature: string | null, candidates: readonly { ownerId: string; secret: Buffer }[]) =>
      verifyWebhookOwner(rawBody, signature, candidates, {
        compare: (actual, expected) => {
          comparisons += 1;
          elapsedMs += 1;
          return timingSafeEqual(actual, expected);
        },
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
      loadCandidates,
      verifyOwner,
      reconcile: providerGet,
      now: () => new Date(epoch + elapsedMs),
    });

    await expect(effects.intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });

    expect(decryptions).toBe(1_000);
    expect(comparisons).toBe(1_000);
    expect(providerGet).toHaveBeenCalledOnce();
    expect(durableEvidence).toEqual({ claims: 1, binds: 1, finalizes: 1 });
    expect(elapsedMs).toBe(12_600);
    expect(elapsedMs).toBeLessThan(WEBHOOK_ACCEPTED_PROCESSING_BUDGET_MS);
  });
});

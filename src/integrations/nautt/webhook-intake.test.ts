import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createInMemoryWebhookDeliveryStore } from "./webhook-delivery-store";
import { createWebhookIntake, type WebhookOrderReconciler } from "./webhook-intake";

const ownerId = "550e8400-e29b-41d4-a716-446655440010";
const delivery = "550e8400-e29b-41d4-a716-446655440011";
const order = "550e8400-e29b-41d4-a716-446655440012";
const secret = "webhook-secret";
const body = Buffer.from(JSON.stringify({ id: delivery, event: "order.paid", created_at: "2026-07-17T20:00:00Z", data: { uuid: order, status: "paid" } }));
const validSignature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

function harness(options: { reconcile?: WebhookOrderReconciler["reconcileWebhookOrder"]; candidates?: readonly { ownerId: string; secret: string }[] } = {}) {
  const deliveryStore = createInMemoryWebhookDeliveryStore();
  const reconcile = options.reconcile ?? vi.fn().mockResolvedValue({ kind: "processed", localOrderId: "550e8400-e29b-41d4-a716-446655440013" });
  const candidateValues = options.candidates ?? [{ ownerId, secret }];
  const loadCandidates = vi.fn(async () => candidateValues.map((candidate) => ({ ownerId: candidate.ownerId, secret: Buffer.from(candidate.secret) })));
  const intake = createWebhookIntake({ deliveryStore, loadCandidates, orderReconciler: { reconcileWebhookOrder: reconcile } });
  return { intake, reconcile, loadCandidates };
}

describe("webhook intake authentication", () => {
  it.each([null, "sha256=bad", `sha256=${"0".repeat(64)}`])("rejects without parse/write/fetch side effects: %s", async (signature) => {
    const { intake, reconcile, loadCandidates } = harness();
    await expect(intake({ rawBody: body, signature, delivery, event: "order.paid" })).resolves.toEqual({ status: 401 });
    if (signature === null || signature === "sha256=bad") expect(loadCandidates).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("rejects multiple matching owners without reconciliation", async () => {
    const { intake, reconcile } = harness({ candidates: [{ ownerId, secret }, { ownerId: "550e8400-e29b-41d4-a716-446655440099", secret }] });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 401 });
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

  it("durably ignores an unknown/final owner-bound order with zero provider GET", async () => {
    const reconcile = vi.fn().mockResolvedValue({ kind: "ignored" });
    const { intake } = harness({ reconcile });
    await expect(intake({ rawBody: body, signature: validSignature, delivery, event: "order.paid" })).resolves.toEqual({ status: 204 });
    expect(reconcile).toHaveBeenCalledOnce();
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

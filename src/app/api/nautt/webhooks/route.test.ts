import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleNauttWebhook } = vi.hoisted(() => ({ handleNauttWebhook: vi.fn() }));
vi.mock("../../../../integrations/nautt/webhook-runtime", () => ({ handleNauttWebhook }));
vi.mock("server-only", () => ({}));

import { MAX_WEBHOOK_BODY_BYTES } from "../../../../integrations/nautt/bounded-webhook-body";
import { createWebhookIntake } from "../../../../integrations/nautt/webhook-intake";
import { createInMemoryWebhookDeliveryStore } from "../../../../integrations/nautt/webhook-delivery-store";
import { POST } from "./route";

beforeEach(() => {
  handleNauttWebhook.mockReset().mockResolvedValue({ status: 204 });
});

function requestFromChunks(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  let pulls = 0;
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pulls++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { canceled = true; },
  });
  const request = new Request("https://payments.example.com/api/nautt/webhooks", { method: "POST", headers, body: stream, duplex: "half" } as RequestInit & { duplex: string });
  return { request, pulls: () => pulls, canceled: () => canceled };
}

describe("POST /api/nautt/webhooks", () => {
  it("preserves accepted multi-chunk bytes exactly and returns an empty no-store response", async () => {
    const chunks = [Buffer.from("{\"a\":"), Buffer.from(" 1}\n")];
    const { request } = requestFromChunks(chunks, { "x-nautt-signature": `sha256=${"a".repeat(64)}` });
    const response = await POST(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(handleNauttWebhook.mock.calls[0][0].rawBody).toEqual(Buffer.concat(chunks));
  });

  it.each([undefined, "sha256=bad", `sha256=${"0".repeat(64)}`])("forwards missing or wrong signatures without rejecting at the route: %s", async (signature) => {
    const headers: Record<string, string> = signature === undefined ? {} : { "x-nautt-signature": signature };
    const { request } = requestFromChunks([Buffer.from("{}")], headers);
    const response = await POST(request);
    expect(response.status).toBe(204);
    expect(handleNauttWebhook).toHaveBeenCalledWith(expect.objectContaining({ signature: signature ?? null }));
  });

  it.each([400, 503] as const)("returns an empty no-store %i intake outcome", async (status) => {
    handleNauttWebhook.mockResolvedValueOnce({ status });
    const { request } = requestFromChunks([Buffer.from("{}")]);

    const response = await POST(request);

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it("maps an unexpected intake failure to an empty no-store 503", async () => {
    handleNauttWebhook.mockRejectedValueOnce(new Error("intake failed"));
    const { request } = requestFromChunks([Buffer.from("{}")]);

    const response = await POST(request);

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it("rejects declared oversize before intake and cancels the untouched stream", async () => {
    const harness = requestFromChunks([new Uint8Array(1)], { "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1) });
    const response = await POST(harness.request);
    expect(response.status).toBe(413);
    expect(harness.canceled()).toBe(true);
    expect(handleNauttWebhook).not.toHaveBeenCalled();
  });

  it("cancels a no-length stream on the first crossing chunk without pulling the tail", async () => {
    const harness = requestFromChunks([new Uint8Array(MAX_WEBHOOK_BODY_BYTES), new Uint8Array(1), new Uint8Array(12)]);
    const response = await POST(harness.request);
    expect(response.status).toBe(413);
    expect(harness.canceled()).toBe(true);
    expect(harness.pulls()).toBe(2);
    expect(handleNauttWebhook).not.toHaveBeenCalled();
  });
});

describe("POST /api/nautt/webhooks integrated intake seam", () => {
  it("routes valid body data.uuid with null webhook_deliveries through real intake to 204", async () => {
    const orderUuid = "550e8400-e29b-41d4-a716-446655440012";
    const ownerId = "550e8400-e29b-41d4-a716-446655440010";
    const deliveryStore = createInMemoryWebhookDeliveryStore();
    const reconcileWebhookOrder = vi.fn().mockResolvedValue({ kind: "processed", localOrderId: "550e8400-e29b-41d4-a716-446655440013" });
    const repairWebhookSettlement = vi.fn().mockResolvedValue({ kind: "processed", localOrderId: "550e8400-e29b-41d4-a716-446655440013" });
    const realIntake = createWebhookIntake({
      deliveryStore,
      resolveOrderOwner: vi.fn().mockResolvedValue(ownerId),
      orderReconciler: { reconcileWebhookOrder, repairWebhookSettlement },
    });

    handleNauttWebhook.mockImplementation(realIntake);

    const body = Buffer.from(JSON.stringify({
      id: "550e8400-e29b-41d4-a716-446655440011",
      event: "order.paid",
      created_at: "2026-07-17T20:00:00Z",
      data: { uuid: orderUuid, webhook_deliveries: null },
    }));
    const { request } = requestFromChunks([body], {
      "x-nautt-delivery": "mismatched-header",
      "x-nautt-event": "mismatched-event",
    });

    const response = await POST(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(reconcileWebhookOrder).toHaveBeenCalledWith(ownerId, orderUuid);
  });
});

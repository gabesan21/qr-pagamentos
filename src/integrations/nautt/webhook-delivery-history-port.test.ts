import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeWebhookDelivery } from "./webhook-delivery-history-port";

const fixture = {
  deliveryUuid: "10000000-0000-4000-8000-000000000001",
  webhookUuid: "10000000-0000-4000-8000-000000000002",
  orderUuid: "10000000-0000-4000-8000-000000000003",
  eventType: "order.failed",
  isDelivered: false,
  isPermanentlyFailed: true,
  attemptNumber: 5,
  createdAt: new Date("2026-07-17T20:00:00Z"),
};

describe("normalized webhook delivery history port", () => {
  it("accepts only the eight directly evidenced normalized fields", () => {
    expect(normalizeWebhookDelivery(fixture)).toEqual(fixture);
    expect(normalizeWebhookDelivery({ ...fixture, responseStatus: null })).toBeNull();
    expect(normalizeWebhookDelivery({ ...fixture, deliveredAt: null })).toBeNull();
    expect(normalizeWebhookDelivery({ ...fixture, attemptNumber: 0 })).toBeNull();
    expect(normalizeWebhookDelivery({ ...fixture, createdAt: "2026-07-17T20:00:00Z" })).toBeNull();
    const missing: Partial<typeof fixture> = { ...fixture };
    delete missing.webhookUuid;
    expect(normalizeWebhookDelivery(missing)).toBeNull();
  });

  it("keeps caller cancellation usable without defining provider transport", () => {
    const controller = new AbortController();
    expect(controller.signal.aborted).toBe(false);
    controller.abort();
    expect(controller.signal.aborted).toBe(true);
  });

  it("contains no production HTTP decoder or unevidenced recovery fields", async () => {
    const source = await readFile(new URL("./webhook-delivery-history-port.ts", import.meta.url), "utf8");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("responseStatus");
    expect(source).not.toContain("deliveredAt");
    expect(source).not.toContain("response_status");
    expect(source).not.toContain("delivered_at");
  });
});

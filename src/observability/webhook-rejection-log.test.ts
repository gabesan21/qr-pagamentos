import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logWebhookRejection } from "./webhook-rejection-log";

const delivery = "550e8400-e29b-41d4-a716-446655440011";

afterEach(() => vi.restoreAllMocks());

describe("redacted webhook-rejection logging", () => {
  it("logs a validated delivery and event verbatim on the closed record", () => {
    const write = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logWebhookRejection("unmatched", delivery, "order.paid");

    expect(write).toHaveBeenCalledOnce();
    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(Object.keys(record).sort()).toEqual(["delivery", "event", "eventType", "level", "reason", "status", "timestamp"]);
    expect(record).toMatchObject({
      level: "warn",
      event: "webhook.rejected",
      reason: "unmatched",
      status: 401,
      delivery,
      eventType: "order.paid",
    });
  });

  it("logs the fixed unknown marker for a missing delivery or event, never inventing one", () => {
    const write = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logWebhookRejection("missing", null, null);

    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(record.delivery).toBe("unknown");
    expect(record.eventType).toBe("unknown");
  });

  it("logs the fixed unknown marker for an attacker-controlled delivery or event that fails validation", () => {
    const write = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logWebhookRejection("malformed", "not-a-uuid", "not-a-documented-event");

    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(record.delivery).toBe("unknown");
    expect(record.eventType).toBe("unknown");
  });

  it("never carries a raw body, signature, or secret in the record", () => {
    const write = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const signature = "sha256=deadbeef";
    const secret = "super-secret-webhook-secret";

    logWebhookRejection("unmatched", delivery, "order.paid");

    const raw = String(write.mock.calls[0][0]);
    expect(raw).not.toContain(signature);
    expect(raw).not.toContain(secret);
    expect(raw).not.toMatch(/body|signature|secret|key/i);
  });

  it("swallows a logging failure without altering caller behavior", () => {
    const write = vi.spyOn(console, "warn").mockImplementation(() => { throw new Error("logger failure"); });

    expect(() => logWebhookRejection("missing", null, null)).not.toThrow();
    expect(write).toHaveBeenCalledOnce();
  });
});

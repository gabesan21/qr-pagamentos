import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { logProviderFailure, providerFailureOperations } from "./provider-failure-log";

afterEach(() => vi.restoreAllMocks());

describe("redacted provider-failure logging", () => {
  it("logs a documented code verbatim on the closed record", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logProviderFailure(providerFailureOperations.onrampOrderCreation, 422, "order.quote_expired");

    expect(write).toHaveBeenCalledOnce();
    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(Object.keys(record).sort()).toEqual(["code", "event", "level", "operation", "status", "timestamp"]);
    expect(record).toMatchObject({
      level: "error",
      event: "provider.request.failed",
      operation: "onramp_order_creation",
      status: 422,
      code: "order.quote_expired",
    });
  });

  it("logs the fixed unknown marker for an omitted code, never inventing one", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logProviderFailure(providerFailureOperations.quoteCreation, 500);

    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(record.code).toBe("undocumented_or_absent");
  });

  it("logs the transport-failure status marker for a network/timeout failure", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logProviderFailure(providerFailureOperations.orderRead, "transport_failure");

    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(record.status).toBe("transport_failure");
    expect(record.code).toBe("undocumented_or_absent");
  });

  it("never carries a response body or an API key in the record", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const apiKey = "super-secret-nautt-api-key";
    const body = JSON.stringify({ apiKey, extra: "provider response body" });

    logProviderFailure(providerFailureOperations.mainWalletBalanceRead, 400, "order.quote_expired");

    const raw = String(write.mock.calls[0][0]);
    expect(raw).not.toContain(apiKey);
    expect(raw).not.toContain(body);
    expect(raw).not.toMatch(/body|apiKey|headers|url/i);
  });

  it("swallows a logging failure without altering caller behavior", () => {
    const write = vi.spyOn(console, "error").mockImplementation(() => { throw new Error("logger failure"); });

    expect(() => logProviderFailure(providerFailureOperations.quoteCreation, 502)).not.toThrow();
    expect(write).toHaveBeenCalledOnce();
  });
});

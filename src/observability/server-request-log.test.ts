import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeRequestId, serverRequestRoutes, withServerRequestLog } from "./server-request-log";

afterEach(() => vi.restoreAllMocks());

describe("server request completion logging", () => {
  it("retains only whole header-safe request ids", () => {
    for (const value of ["a", "req-42", "ABC.def_9", "a".repeat(64)]) {
      expect(normalizeRequestId(value)).toBe(value);
    }
  });

  it("replaces invalid inbound request ids without retaining their values", () => {
    for (const value of [null, "", "a".repeat(65), " request", "request ", "req\nnext", "req\u00e9", "one,two", ".request", "request/"]) {
      expect(normalizeRequestId(value)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it("writes one closed completion record and preserves a no-store response", async () => {
    const write = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await withServerRequestLog(
      "req-42",
      { method: "POST", route: serverRequestRoutes.publicCheckout },
      () => new Response(null, { status: 429, headers: { "Cache-Control": "no-store" } }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("req-42");
    expect(write).toHaveBeenCalledOnce();
    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(Object.keys(record).sort()).toEqual([
      "durationMs", "event", "level", "method", "outcome", "requestId", "route", "status", "timestamp",
    ]);
    expect(record).toMatchObject({
      level: "info",
      event: "request.completed",
      requestId: "req-42",
      method: "POST",
      route: "/api/payment-links/[identifier]/checkout",
      status: 429,
      outcome: "completed",
    });
  });

  it("preserves redirects and cookies while adding the normalized id when the writer fails", async () => {
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("logger failure"); });
    const response = new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": "qr_session=; Path=/" } });
    const logged = await withServerRequestLog(
      "safe_id",
      { method: "POST", route: serverRequestRoutes.logout },
      () => response,
    );

    expect(logged.headers.get("location")).toBe("/login");
    expect(logged.headers.get("set-cookie")).toContain("qr_session=");
    expect(logged.headers.get("x-request-id")).toBe("safe_id");
  });

  it("logs one failed completion, ignores writer failure, and rethrows the original handler failure", async () => {
    const failure = new Error("handler failure");
    const write = vi.spyOn(console, "info").mockImplementation(() => { throw new Error("logger failure"); });

    await expect(withServerRequestLog(
      "safe_id",
      { method: "POST", route: serverRequestRoutes.logout },
      () => { throw failure; },
    )).rejects.toBe(failure);
    expect(write).toHaveBeenCalledOnce();
    expect(JSON.parse(String(write.mock.calls[0][0]))).toMatchObject({ level: "error", status: 500, outcome: "failed" });
  });
});

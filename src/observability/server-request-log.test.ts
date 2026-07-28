import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeRequestId, serverRequestRoutes, withServerRequestLog } from "./server-request-log";

afterEach(() => vi.restoreAllMocks());

describe("server request completion logging", () => {
  it("pins the standalone checkout route templates", () => {
    expect(serverRequestRoutes.standaloneCheckout).toBe("/api/store/[slug]/checkout");
    expect(serverRequestRoutes.standaloneCheckoutStatus).toBe("/api/store/[slug]/checkout/status");
  });

  it("pins the administrator user deletion route template", () => {
    expect(serverRequestRoutes.adminUserDelete).toBe("/admin/users/[id]/delete");
  });

  it("pins the administrator profile editor route templates", () => {
    expect(serverRequestRoutes.adminUserIdentity).toBe("/admin/users/[id]/identity");
    expect(serverRequestRoutes.adminUserLocale).toBe("/admin/users/[id]/locale");
    expect(serverRequestRoutes.adminUserCheckoutPolicy).toBe("/admin/users/[id]/checkout-policy");
    expect(serverRequestRoutes.adminUserStorefront).toBe("/admin/users/[id]/storefront");
  });

  it("pins the storefront cart checkout route template", () => {
    expect(serverRequestRoutes.storefrontCartCheckout).toBe("/api/store/[slug]/cart/checkout");
  });

  it("pins the password-reset and TOTP route templates", () => {
    expect(serverRequestRoutes.resetPassword).toBe("/reset-password/submit");
    expect(serverRequestRoutes.profileTotpEnroll).toBe("/profile/totp/enroll");
    expect(serverRequestRoutes.profileTotpConfirm).toBe("/profile/totp/confirm");
    expect(serverRequestRoutes.profileTotpDisable).toBe("/profile/totp/disable");
    expect(serverRequestRoutes.profileTotpRegenerate).toBe("/profile/totp/regenerate");
    expect(serverRequestRoutes.loginTotpChallenge).toBe("/login/totp-challenge");
  });

  it("retains only whole header-safe request ids", () => {
    for (const value of ["a", "req-42", "ABC.def_9", "a".repeat(64)]) {
      expect(normalizeRequestId(value)).toBe(value);
    }
  });

  it("replaces invalid inbound request ids without retaining their values", () => {
    for (const value of [null, "", "a".repeat(65), " request", "request ", "req\r", "req\n", "req\r\n", "req\nnext", "req\u00e9", "one,two", ".request", "request/"]) {
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

  it("preserves redirects and cookies while adding a generated id for a terminal line break", async () => {
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("logger failure"); });
    const response = new Response(null, { status: 303, headers: { Location: "/login", "Set-Cookie": "qr_session=; Path=/" } });
    const logged = await withServerRequestLog(
      "safe_id\r\n",
      { method: "POST", route: serverRequestRoutes.logout },
      () => response,
    );

    expect(logged.headers.get("location")).toBe("/login");
    expect(logged.headers.get("set-cookie")).toContain("qr_session=");
    expect(logged.headers.get("x-request-id")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
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

  it("does not retain handler-provided secrets or response cookies in the completion record", async () => {
    const secret = "super-secret-session-token";
    const write = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await withServerRequestLog(
      "safe-request-id",
      { method: "POST", route: serverRequestRoutes.logout },
      () => new Response(JSON.stringify({ secret }), {
        status: 200,
        headers: { "Set-Cookie": `qr_session=${secret}; Path=/` },
      }),
    );

    expect(response.headers.get("set-cookie")).toContain(secret);
    expect(write).toHaveBeenCalledOnce();
    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(Object.keys(record).sort()).toEqual([
      "durationMs", "event", "level", "method", "outcome", "requestId", "route", "status", "timestamp",
    ]);
    const raw = JSON.stringify(record);
    expect(raw).not.toContain(secret);
    expect(raw).not.toContain("qr_session");
    write.mockRestore();
  });

  it("replaces an invalid inbound request id without retaining a secret-like value", async () => {
    const write = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await withServerRequestLog(
      "secret-token-xyz!",
      { method: "GET", route: serverRequestRoutes.logout },
      () => new Response(null, { status: 200 }),
    );

    const record = JSON.parse(String(write.mock.calls[0][0]));
    expect(record.requestId).not.toBe("secret-token-xyz!");
    expect(record.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    write.mockRestore();
  });
});

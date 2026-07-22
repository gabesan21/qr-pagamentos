import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { allowRateLimit, read } = vi.hoisted(() => ({ allowRateLimit: vi.fn(), read: vi.fn() }));
vi.mock("@/checkout/payment-status", () => ({ getPublicPaymentStatusService: () => ({ read }) }));
vi.mock("@/security/public-rate-limit", () => ({
  allowPublicPaymentLinkRequest: allowRateLimit,
  publicPaymentLinkRateLimitSurface: { status: "public-payment-status-poll" },
  publicRateLimitResponse: () => new Response(null, { status: 429, headers: { "Cache-Control": "no-store" } }),
}));

import { dynamic, POST } from "./route";

describe("POST /api/payment-links/[identifier]/checkout/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowRateLimit.mockReturnValue(true);
  });

  it("is dynamic, sessionless and returns only the closed redacted payment body", async () => {
    read.mockResolvedValueOnce({ state: "PENDING", pixCopyPaste: "000201" });
    const response = await POST(new Request("https://example.test", { method: "POST", headers: { cookie: "qr_session=ignored" }, body: JSON.stringify({ statusCapability: "opaque-capability" }) }));

    expect(dynamic).toBe("force-dynamic");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ payment: { state: "PENDING", pixCopyPaste: "000201" } });
    expect(read).toHaveBeenCalledWith("opaque-capability");
  });

  it("maps every valid loser to the same empty no-store 404", async () => {
    read.mockResolvedValue(null);
    for (const body of [{}, { statusCapability: "wrong" }, { statusCapability: "wrong", ignored: true }]) {
      const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) }));
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
      await expect(response.text()).resolves.toBe("");
    }
  });

  it("maps only invalid JSON to the empty no-store 400", async () => {
    const response = await POST(new Request("https://example.test", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(read).not.toHaveBeenCalled();
  });

  it("returns an empty no-store 429 before parsing the body or reading status", async () => {
    allowRateLimit.mockReturnValueOnce(false);
    const response = await POST(new Request("https://example.test", { method: "POST", body: "{" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.text()).resolves.toBe("");
    expect(read).not.toHaveBeenCalled();
  });
});

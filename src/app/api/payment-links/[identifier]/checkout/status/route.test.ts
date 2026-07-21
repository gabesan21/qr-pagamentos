import { beforeEach, describe, expect, it, vi } from "vitest";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/checkout/payment-status", () => ({ getPublicPaymentStatusService: () => ({ read }) }));

import { dynamic, POST } from "./route";

describe("POST /api/payment-links/[identifier]/checkout/status", () => {
  beforeEach(() => vi.clearAllMocks());

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
});

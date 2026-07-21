import { beforeEach, describe, expect, it, vi } from "vitest";

const { checkout } = vi.hoisted(() => ({ checkout: vi.fn() }));
vi.mock("@/checkout/public-checkout", () => ({ getPublicCheckoutService: () => ({ checkout }) }));

import { dynamic, POST } from "./route";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
const body = { idempotencyKey: "retry-key-with-enough-entropy", customer: { name: null, email: null, cpf: null, address: null } };
const context = { params: Promise.resolve({ identifier }) };

describe("POST /api/payment-links/[identifier]/checkout", () => {
  beforeEach(() => vi.clearAllMocks());
  it("is sessionless, dynamic and maps only the redacted accepted capability", async () => {
    checkout.mockResolvedValueOnce({ kind: "accepted", status: 201, payment: { state: "PENDING", pixCopyPaste: "000201" }, statusCapability: "opaque-bearer" });
    const response = await POST(new Request(`https://example.test/api/payment-links/${identifier}/checkout`, { method: "POST", headers: { "content-type": "application/json", cookie: "qr_session=ignored" }, body: JSON.stringify(body) }), context);
    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ payment: { state: "PENDING", pixCopyPaste: "000201" }, statusCapability: "opaque-bearer" });
    expect(checkout).toHaveBeenCalledWith(identifier, body);
  });
  it("returns a redacted indeterminate capability with 202", async () => {
    checkout.mockResolvedValueOnce({ kind: "accepted", status: 202, payment: { state: "INDETERMINATE" }, statusCapability: "opaque-bearer" });
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) }), context);
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ payment: { state: "INDETERMINATE" }, statusCapability: "opaque-bearer" });
  });
  it.each([["invalid", 400], ["unavailable", 404], ["provider-unavailable", 503]] as const)("returns an empty no-store %s outcome", async (kind, status) => {
    checkout.mockResolvedValueOnce({ kind });
    const response = await POST(new Request("https://example.test", { method: "POST", body: JSON.stringify(body) }), context);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.text()).resolves.toBe("");
  });
  it("rejects invalid JSON without calling the server service", async () => {
    const response = await POST(new Request("https://example.test", { method: "POST", body: "{" }), context);
    expect(response.status).toBe(400);
    expect(checkout).not.toHaveBeenCalled();
  });
});

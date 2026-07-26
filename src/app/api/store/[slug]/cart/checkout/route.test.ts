import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { allowRateLimit, checkout } = vi.hoisted(() => ({ allowRateLimit: vi.fn(), checkout: vi.fn() }));
vi.mock("@/checkout/storefront-cart-checkout", () => ({ getStorefrontCartCheckoutService: () => ({ checkout }) }));
vi.mock("@/security/public-rate-limit", () => ({
  allowPublicPaymentLinkRequest: allowRateLimit,
  publicPaymentLinkRateLimitSurface: { storefrontCartCheckout: "storefront-cart-checkout-submit" },
  publicRateLimitResponse: () => new Response(null, { status: 429, headers: { "Cache-Control": "no-store" } }),
}));

import { dynamic, POST } from "./route";

const slug = "minha-loja";
const body = { items: [{ reference: "11111111-1111-4111-8111-111111111111", quantity: 2 }] };
const context = { params: Promise.resolve({ slug }) };

describe("POST /api/store/[slug]/cart/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allowRateLimit.mockReturnValue(true);
  });
  it("is sessionless, dynamic and answers exactly the one-time link identifier", async () => {
    checkout.mockResolvedValueOnce({ kind: "issued", paymentLinkIdentifier: "a".repeat(24) });
    const response = await POST(new Request(`https://example.test/api/store/${slug}/cart/checkout`, { method: "POST", headers: { "content-type": "application/json", cookie: "qr_session=ignored" }, body: JSON.stringify(body) }), context);
    expect(dynamic).toBe("force-dynamic");
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ paymentLinkIdentifier: "a".repeat(24) });
    expect(checkout).toHaveBeenCalledWith(slug, body);
  });
  it.each([["invalid", 400], ["unavailable", 404]] as const)("returns an empty no-store %s outcome", async (kind, status) => {
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
  it("returns an empty no-store 429 before parsing the body or calling checkout", async () => {
    allowRateLimit.mockReturnValueOnce(false);
    const response = await POST(new Request("https://example.test", { method: "POST", body: "{" }), context);
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.text()).resolves.toBe("");
    expect(checkout).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";

const { requireAdminFromCookie, protectedMutationResponse, create } = vi.hoisted(() => ({ requireAdminFromCookie: vi.fn(), protectedMutationResponse: vi.fn(), create: vi.fn() }));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/payment-link", () => ({ getPaymentLinkService: () => ({ create }) }));

import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const request = (values: Record<string, string> = {}) => new Request("http://0.0.0.0:3000/admin/payment-links", { method: "POST", body: new URLSearchParams(values) });

describe("payment-link generation route", () => {
  it("returns protected outcomes before parsing or service dispatch", async () => {
    for (const status of [401, 403]) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("protected"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));
      const response = await POST(request());
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("uses only the cookie principal and redirects without input disclosure", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    const response = await POST(request({ productId: "product", currencyPairId: "pair", linkType: "REUSABLE", expiresAt: "", actorId: "attacker" }));
    expect(create).toHaveBeenCalledWith(actor, { productId: "product", currencyPairId: "pair", linkType: "REUSABLE", expiresAt: "" });
    expect(response.headers.get("location")).toBe("/admin?success=payment-link-created");
  });

  it("maps malformed, unavailable, and conflicting requests to one opaque redirect", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    create.mockRejectedValueOnce(new Error("inactive dependency"));
    create.mockRejectedValueOnce(new Error("conflict"));
    const unavailable = await POST(request({ productId: "secret-product" }));
    const conflict = await POST(request({ productId: "secret-conflict" }));
    for (const response of [unavailable, conflict]) {
      expect(response.headers.get("location")).toBe("/admin?error=payment-link-mutation-failed");
      expect(response.headers.get("location")).not.toContain("secret");
    }
  });
});

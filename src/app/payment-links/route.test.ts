import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireOwnerFromCookie, ownerProtectedMutationResponse, create } = vi.hoisted(() => ({ requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), create: vi.fn() }));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/payment-link", () => ({ getPaymentLinkService: () => ({ create }) }));
import { POST } from "./route";
const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };
describe("owner payment-link route", () => {
  it("re-authorizes before form parsing and never trusts a supplied owner", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected")); ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 403 }));
    const deniedRequest = new Request("http://local/payment-links", { method: "POST", headers: sameOrigin, body: new URLSearchParams() });
    const formData = vi.spyOn(deniedRequest, "formData");
    const protectedResponse = await POST(deniedRequest);
    expect(protectedResponse.status).toBe(403); expect(await protectedResponse.text()).toBe(""); expect(formData).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    requireOwnerFromCookie.mockResolvedValue(owner); ownerProtectedMutationResponse.mockReturnValue(null);
    const response = await POST(new Request("http://local/payment-links", { method: "POST", headers: sameOrigin, body: new URLSearchParams({ productId: "product", currencyPairId: "pair", linkType: "REUSABLE", ownerId: "forged" }) }));
    expect(create).toHaveBeenCalledWith(owner, { productId: "product", currencyPairId: "pair", linkType: "REUSABLE", expiresAt: null });
    expect(response.headers.get("location")).toBe("/?payment-links=created");
  });
});

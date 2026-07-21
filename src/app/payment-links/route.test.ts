import { describe, expect, it, vi } from "vitest";

const { requireOwnerFromCookie, ownerProtectedMutationResponse, create } = vi.hoisted(() => ({ requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), create: vi.fn() }));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/payment-link", () => ({ getPaymentLinkService: () => ({ create }) }));
import { POST } from "./route";
const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
describe("owner payment-link route", () => {
  it("re-authorizes before form parsing and never trusts a supplied owner", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected")); ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const protectedResponse = await POST(new Request("http://local/payment-links", { method: "POST", body: new URLSearchParams() }));
    expect(protectedResponse.status).toBe(401); expect(await protectedResponse.text()).toBe("");
    requireOwnerFromCookie.mockResolvedValue(owner); ownerProtectedMutationResponse.mockReturnValue(null);
    const response = await POST(new Request("http://local/payment-links", { method: "POST", body: new URLSearchParams({ productId: "product", currencyPairId: "pair", linkType: "REUSABLE", ownerId: "forged" }) }));
    expect(create).toHaveBeenCalledWith(owner, { productId: "product", currencyPairId: "pair", linkType: "REUSABLE", expiresAt: null });
    expect(response.headers.get("location")).toBe("/?payment-links=created");
  });
});

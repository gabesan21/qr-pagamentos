import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { requireOwnerFromCookie, ownerProtectedMutationResponse, update } = vi.hoisted(() => ({ requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), update: vi.fn() }));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/checkout-policy", () => ({ getCheckoutPolicyService: () => ({ update }) }));
import { POST } from "./route";
const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };
describe("owner checkout-policy route", () => {
  it("re-authorizes before form parsing and updates only its actor", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected")); ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 403 }));
    const deniedRequest = new Request("http://local/checkout-policy", { method: "POST", headers: sameOrigin, body: new URLSearchParams() });
    const formData = vi.spyOn(deniedRequest, "formData");
    const protectedResponse = await POST(deniedRequest);
    expect(protectedResponse.status).toBe(403); expect(await protectedResponse.text()).toBe(""); expect(formData).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    requireOwnerFromCookie.mockResolvedValue(owner); ownerProtectedMutationResponse.mockReturnValue(null);
    const response = await POST(new Request("http://local/checkout-policy", { method: "POST", headers: sameOrigin, body: new URLSearchParams({ checkoutDataPolicy: "EMAIL", ownerId: "forged" }) }));
    expect(update).toHaveBeenCalledWith(owner, "EMAIL"); expect(response.headers.get("location")).toBe("/?checkout-policy=changed");
  });
});

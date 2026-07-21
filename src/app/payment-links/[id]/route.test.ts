import { describe, expect, it, vi } from "vitest";
const { requireOwnerFromCookie, ownerProtectedMutationResponse, deactivate } = vi.hoisted(() => ({ requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), deactivate: vi.fn() }));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/payment-link", () => ({ getPaymentLinkService: () => ({ deactivate }) }));
import { POST } from "./route";
const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
describe("owner payment-link revocation route", () => {
  it("re-authorizes before resolving the target and redirects opaquely", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected")); ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const protectedResponse = await POST(new Request("http://local/payment-links/secret", { method: "POST" }), { params: Promise.resolve({ id: "secret" }) });
    expect(protectedResponse.status).toBe(401); expect(deactivate).not.toHaveBeenCalled();
    requireOwnerFromCookie.mockResolvedValue(owner); ownerProtectedMutationResponse.mockReturnValue(null);
    const response = await POST(new Request("http://local/payment-links/secret", { method: "POST" }), { params: Promise.resolve({ id: "foreign" }) });
    expect(deactivate).toHaveBeenCalledWith(owner, "foreign"); expect(response.headers.get("location")).toBe("/?payment-links=revoked");
  });
});

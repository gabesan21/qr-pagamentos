import { describe, expect, it, vi } from "vitest";

const { requireAdminFromCookie, protectedMutationResponse, deactivate } = vi.hoisted(() => ({ requireAdminFromCookie: vi.fn(), protectedMutationResponse: vi.fn(), deactivate: vi.fn() }));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/payment-link", () => ({ getPaymentLinkService: () => ({ deactivate }) }));

import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const request = new Request("http://0.0.0.0:3000/admin/payment-links/secret", { method: "POST" });

describe("payment-link revocation route", () => {
  it("returns protected outcomes before target work", async () => {
    requireAdminFromCookie.mockRejectedValueOnce(new Error("protected"));
    protectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const response = await POST(request, { params: Promise.resolve({ id: "secret" }) });
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(deactivate).not.toHaveBeenCalled();
  });

  it("deactivates only with the authorized actor and maps all other outcomes opaquely", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    const success = await POST(request, { params: Promise.resolve({ id: "payment-link" }) });
    expect(deactivate).toHaveBeenCalledWith(actor, "payment-link");
    expect(success.headers.get("location")).toBe("/admin?success=payment-link-revoked");

    deactivate.mockRejectedValueOnce(new Error("already revoked secret"));
    const failed = await POST(request, { params: Promise.resolve({ id: "secret" }) });
    expect(failed.headers.get("location")).toBe("/admin?error=payment-link-mutation-failed");
    expect(failed.headers.get("location")).not.toContain("secret");
  });
});

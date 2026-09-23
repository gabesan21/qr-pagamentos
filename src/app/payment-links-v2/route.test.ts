import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireOwnerFromCookie, ownerProtectedMutationResponse, create } = vi.hoisted(() => ({ requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), create: vi.fn() }));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/payment-link-v2", () => ({ getPaymentLinkV2Service: () => ({ create }) }));
import { POST } from "./route";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };

function request(body: URLSearchParams) {
  return new Request("http://local/payment-links-v2", { method: "POST", headers: sameOrigin, body });
}

describe("owner payment-link-v2 create route", () => {
  it("re-authorizes before form parsing and never trusts a supplied owner", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected"));
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 403 }));
    const deniedRequest = request(new URLSearchParams());
    const formData = vi.spyOn(deniedRequest, "formData");
    const protectedResponse = await POST(deniedRequest);
    expect(protectedResponse.status).toBe(403);
    expect(await protectedResponse.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    create.mockResolvedValueOnce({ id: "link-id" });
    const response = await POST(request(new URLSearchParams({ compositionKind: "FIXED_AMOUNT", currencyPairId: "pair", linkType: "REUSABLE", descriptionPtBr: "Doação", descriptionEn: "Donation", amount: "10.25", ownerId: "forged" })));
    expect(create).toHaveBeenCalledWith(owner, {
      compositionKind: "FIXED_AMOUNT",
      currencyPairId: "pair",
      linkType: "REUSABLE",
      expiresAt: null,
      lines: null,
      descriptionPtBr: "Doação",
      descriptionEn: "Donation",
      amount: "10.25",
    });
    expect(response.headers.get("location")).toBe("/links/v2/link-id?payment-links-v2=created");
  });

  it("maps any service failure to the opaque failed redirect", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    create.mockRejectedValueOnce(new Error("validation"));

    const response = await POST(request(new URLSearchParams({ compositionKind: "PRODUCT_LINES" })));
    expect(response.headers.get("location")).toBe("/links/new?payment-links-v2=failed");
  });
});

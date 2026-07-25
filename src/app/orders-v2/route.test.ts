import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireOwnerFromCookie, ownerProtectedMutationResponse, createAdHoc } = vi.hoisted(() => ({ requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), createAdHoc: vi.fn() }));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/orders/order-v2", () => ({ getOrderV2Service: () => ({ createAdHoc }) }));
import { POST } from "./route";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };

function request(body: URLSearchParams) {
  return new Request("http://local/orders-v2", { method: "POST", headers: sameOrigin, body });
}

const adHocForm = new URLSearchParams({
  amount: "10.25",
  currencyPairId: "990e8400-e29b-41d4-a716-446655440099",
  descriptionPtBr: "Doação",
  descriptionEn: "Donation",
  checkoutDataPolicy: "NONE",
  customer: JSON.stringify({ name: null, email: null, cpf: null, address: null }),
});

describe("owner order-v2 ad-hoc create route", () => {
  it("re-authorizes before form parsing and never trusts a supplied owner", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected"));
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const deniedRequest = request(new URLSearchParams());
    const formData = vi.spyOn(deniedRequest, "formData");
    const protectedResponse = await POST(deniedRequest);
    expect(protectedResponse.status).toBe(401);
    expect(await protectedResponse.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(createAdHoc).not.toHaveBeenCalled();

    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    createAdHoc.mockResolvedValue({ kind: "created", order: { id: "order" } });
    const forged = new URLSearchParams(adHocForm);
    forged.set("ownerId", "forged");
    const response = await POST(request(forged));
    expect(createAdHoc).toHaveBeenCalledWith(owner, {
      amount: "10.25",
      currencyPairId: "990e8400-e29b-41d4-a716-446655440099",
      descriptionPtBr: "Doação",
      descriptionEn: "Donation",
      checkoutDataPolicy: "NONE",
      customer: adHocForm.get("customer"),
    });
    expect(response.headers.get("location")).toBe("/orders?orders-v2=created");
  });

  it("maps any service failure to the opaque failed redirect", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    createAdHoc.mockRejectedValueOnce(new Error("validation"));

    const response = await POST(request(new URLSearchParams(adHocForm)));
    expect(response.headers.get("location")).toBe("/orders?orders-v2=failed");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireOwnerFromCookie, ownerProtectedMutationResponse, edit, setActive } = vi.hoisted(() => ({ requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), edit: vi.fn(), setActive: vi.fn() }));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/payment-link-v2", () => ({ getPaymentLinkV2Service: () => ({ edit, setActive }) }));
import { POST } from "./route";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };
const context = { params: Promise.resolve({ id: "link-id" }) };

function request(body: URLSearchParams) {
  return new Request("http://local/payment-links-v2/link-id", { method: "POST", headers: sameOrigin, body });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireOwnerFromCookie.mockResolvedValue(owner);
  ownerProtectedMutationResponse.mockReturnValue(null);
});

describe("owner payment-link-v2 action route", () => {
  it("re-authorizes before form parsing and dispatches the closed action set", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected"));
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const deniedRequest = request(new URLSearchParams({ action: "edit" }));
    const formData = vi.spyOn(deniedRequest, "formData");
    const protectedResponse = await POST(deniedRequest, context);
    expect(protectedResponse.status).toBe(401);
    expect(await protectedResponse.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();

    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);

    const editResponse = await POST(request(new URLSearchParams({ action: "edit", version: "3", expiresAt: "", lines: "[{\"productId\":\"p\",\"quantity\":1}]" })), context);
    expect(edit).toHaveBeenCalledWith(owner, "link-id", "3", { expiresAt: "", lines: "[{\"productId\":\"p\",\"quantity\":1}]" });
    expect(editResponse.headers.get("location")).toBe("/?payment-links-v2=edited");

    const activateResponse = await POST(request(new URLSearchParams({ action: "activate", version: "4" })), context);
    expect(setActive).toHaveBeenCalledWith(owner, "link-id", "4", "true");
    expect(activateResponse.headers.get("location")).toBe("/?payment-links-v2=activated");

    const deactivateResponse = await POST(request(new URLSearchParams({ action: "deactivate", version: "5" })), context);
    expect(setActive).toHaveBeenCalledWith(owner, "link-id", "5", "false");
    expect(deactivateResponse.headers.get("location")).toBe("/?payment-links-v2=deactivated");
  });

  it("omits unsubmitted edit fields so absent means unchanged", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);

    await POST(request(new URLSearchParams({ action: "edit", version: "3", amount: "11.5" })), context);
    expect(edit).toHaveBeenCalledWith(owner, "link-id", "3", { amount: "11.5" });
  });

  it("maps unsupported actions and service failures to the opaque failed redirect", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);

    const unsupported = await POST(request(new URLSearchParams({ action: "delete" })), context);
    expect(unsupported.headers.get("location")).toBe("/?payment-links-v2=failed");
    expect(edit).not.toHaveBeenCalled();
    expect(setActive).not.toHaveBeenCalled();

    edit.mockRejectedValueOnce(new Error("conflict"));
    const failed = await POST(request(new URLSearchParams({ action: "edit", version: "3" })), context);
    expect(failed.headers.get("location")).toBe("/?payment-links-v2=failed");
  });
});

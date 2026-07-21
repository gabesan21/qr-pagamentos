import { describe, expect, it, vi } from "vitest";

const { requireOwnerFromCookie, ownerProtectedMutationResponse, create, update, setActive, remove } = vi.hoisted(() => ({ requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), create: vi.fn(), update: vi.fn(), setActive: vi.fn(), remove: vi.fn() }));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/product", async (original) => ({ ...(await original<typeof import("@/auth/product")>()), getProductService: () => ({ create, update, setActive, delete: remove }) }));

import { POST } from "./route";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };
const request = (values: Record<string, string> = {}, headers: Record<string, string> = sameOrigin) =>
  new Request("http://local/products", { method: "POST", headers, body: new URLSearchParams(values) });

describe("owner product route", () => {
  it("rejects cross-origin and missing-Origin posts before any auth or service work", async () => {
    for (const headers of [{ host: "local" }, { origin: "https://evil.example", host: "local" }] as Record<string, string>[]) {
      const response = await POST(request({}, headers));
      expect(response.status).toBe(403); expect(await response.text()).toBe("");
    }
    expect(requireOwnerFromCookie).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });
  it("returns an empty protected response before parsing input", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected"));
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const response = await POST(request());
    expect(response.status).toBe(401); expect(await response.text()).toBe(""); expect(create).not.toHaveBeenCalled();
  });
  it("uses only the cookie principal and opaque redirects", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner); ownerProtectedMutationResponse.mockReturnValue(null);
    const response = await POST(request({ action: "create", internalName: "Donation", ownerId: "forged" }));
    expect(create).toHaveBeenCalledWith(owner, expect.objectContaining({ internalName: "Donation" }));
    expect(response.headers.get("location")).toBe("/?products=create");
  });
});

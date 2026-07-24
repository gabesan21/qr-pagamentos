import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireOwnerFromCookie, ownerProtectedMutationResponse, create, update, setActive, archive, remove } = vi.hoisted(() => ({ requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), create: vi.fn(), update: vi.fn(), setActive: vi.fn(), archive: vi.fn(), remove: vi.fn() }));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/product", async (original) => ({ ...(await original<typeof import("@/auth/product")>()), getProductService: () => ({ create, update, setActive, archive, delete: remove }) }));

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
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 403 }));
    const deniedRequest = request();
    const formData = vi.spyOn(deniedRequest, "formData");
    const response = await POST(deniedRequest);
    expect(response.status).toBe(403); expect(await response.text()).toBe(""); expect(formData).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
  });
  it("uses only the cookie principal and opaque redirects", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner); ownerProtectedMutationResponse.mockReturnValue(null);
    const response = await POST(request({ action: "create", internalName: "Donation", ownerId: "forged" }));
    expect(create).toHaveBeenCalledWith(owner, expect.objectContaining({ internalName: "Donation" }));
    expect(response.headers.get("location")).toBe("/?products=create");
  });
  it("forwards the archive action with only the identifier and version", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner); ownerProtectedMutationResponse.mockReturnValue(null);
    const response = await POST(request({ action: "archive", id: "product-id", version: "3" }));
    expect(archive).toHaveBeenCalledWith(owner, "product-id", "3");
    expect(response.headers.get("location")).toBe("/?products=archive");
  });
  it("passes submitted catalog-media fields and omits absent ones", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner); ownerProtectedMutationResponse.mockReturnValue(null);
    const withCatalog = await POST(request({ action: "update", id: "product-id", version: "1", currencyCode: "USD", imageMediaId: "", categoryId: "category-id" }));
    expect(update).toHaveBeenCalledWith(owner, "product-id", "1", expect.objectContaining({ currencyCode: "USD", imageMediaId: "", categoryId: "category-id" }));
    expect(withCatalog.headers.get("location")).toBe("/?products=update");

    update.mockClear();
    await POST(request({ action: "update", id: "product-id", version: "1" }));
    const values = update.mock.calls[0]?.[3] as Record<string, unknown>;
    expect(values).not.toHaveProperty("currencyCode");
    expect(values).not.toHaveProperty("imageMediaId");
    expect(values).not.toHaveProperty("categoryId");
  });
});

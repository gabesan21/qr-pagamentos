import { describe, expect, it, vi } from "vitest";

const { requireOwnerFromCookie, ownerProtectedMutationResponse, update, StorefrontSettingsConflictError } = vi.hoisted(() => {
  class StorefrontSettingsConflictError extends Error {}
  return { requireOwnerFromCookie: vi.fn(), ownerProtectedMutationResponse: vi.fn(), update: vi.fn(), StorefrontSettingsConflictError };
});
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/storefront-settings", () => ({ getStorefrontSettingsService: () => ({ update }), StorefrontSettingsConflictError }));

import { POST } from "./route";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };

const sameOrigin = { origin: "http://local", host: "local" };

function request(fields: Record<string, string>, headers: HeadersInit = sameOrigin) {
  return new Request("http://local/storefront", { method: "POST", headers, body: new URLSearchParams(fields) });
}

describe("owner storefront route", () => {
  it("rejects missing and mismatched Origin before authorization or service work", async () => {
    for (const headers of [{ host: "local" }, { origin: "https://evil.example", host: "local" }]) {
      requireOwnerFromCookie.mockClear();
      ownerProtectedMutationResponse.mockClear();
      update.mockClear();

      const response = await POST(request({ storefrontSlug: "my-store" }, headers));

      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
      expect(requireOwnerFromCookie).not.toHaveBeenCalled();
      expect(ownerProtectedMutationResponse).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    }
  });

  it("re-authorizes before form parsing and updates only its actor", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected"));
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const protectedResponse = await POST(request({ storefrontSlug: "my-store" }));
    expect(protectedResponse.status).toBe(401);
    expect(update).not.toHaveBeenCalled();

    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    update.mockResolvedValue({});
    const response = await POST(request({ storefrontSlug: "my-store", storefrontDisplayNamePtBr: "Loja", storefrontDisplayNameEn: "Store", storefrontAccentColor: "#1A2B3C", storefrontEnabled: "true", ownerId: "forged" }));
    expect(update).toHaveBeenCalledWith(owner, {
      storefrontSlug: "my-store",
      storefrontDisplayNamePtBr: "Loja",
      storefrontDisplayNameEn: "Store",
      storefrontAccentColor: "#1A2B3C",
      storefrontEnabled: "true",
    });
    expect(response.headers.get("location")).toBe("/?storefront=changed");
  });

  it("maps slug collisions and validation failures to opaque redirects", async () => {
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
    update.mockRejectedValueOnce(new StorefrontSettingsConflictError("taken"));
    const conflict = await POST(request({ storefrontSlug: "my-store" }));
    expect(conflict.headers.get("location")).toBe("/?storefront=conflict");
    update.mockRejectedValueOnce(new Error("invalid"));
    const failed = await POST(request({ storefrontSlug: "Invalid" }));
    expect(failed.headers.get("location")).toBe("/?storefront=failed");
  });
});

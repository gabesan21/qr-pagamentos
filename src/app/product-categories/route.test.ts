import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  requireOwnerFromCookie,
  ownerProtectedMutationResponse,
  create,
  update,
  deactivate,
} = vi.hoisted(() => ({
  requireOwnerFromCookie: vi.fn(),
  ownerProtectedMutationResponse: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deactivate: vi.fn(),
}));
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie, ownerProtectedMutationResponse }));
vi.mock("@/auth/product-category", async (original) => ({
  ...(await original<typeof import("@/auth/product-category")>()),
  getProductCategoryService: () => ({ create, update, deactivate }),
}));

import { ProductCategoryConflictError } from "@/auth/product-category";
import { POST } from "./route";

const owner = {
  id: "owner",
  username: "owner",
  email: null,
  role: "USER" as const,
  status: "ACTIVE" as const,
  createdAt: new Date(),
};
const request = (
  values: Record<string, string> = {},
  headers: Record<string, string> = { origin: "http://local", host: "local" },
) => new Request("http://local/product-categories", {
  method: "POST",
  headers,
  body: new URLSearchParams(values),
});

describe("owner product category route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOwnerFromCookie.mockResolvedValue(owner);
    ownerProtectedMutationResponse.mockReturnValue(null);
  });

  it("rejects cross-origin and missing-Origin posts before auth, parsing, or service work", async () => {
    for (const headers of [
      { host: "local" },
      { origin: "https://evil.example", host: "local" },
    ] as Array<Record<string, string>>) {
      const denied = request({}, headers);
      const formData = vi.spyOn(denied, "formData");
      const response = await POST(denied);
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
      expect(formData).not.toHaveBeenCalled();
    }
    expect(requireOwnerFromCookie).not.toHaveBeenCalled();
  });

  it("returns an empty protected response before parsing input", async () => {
    requireOwnerFromCookie.mockRejectedValueOnce(new Error("protected"));
    ownerProtectedMutationResponse.mockReturnValueOnce(new Response(null, { status: 401 }));
    const denied = request();
    const formData = vi.spyOn(denied, "formData");

    const response = await POST(denied);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("uses only the cookie owner and dispatches the closed actions", async () => {
    const categoryId = "550e8400-e29b-41d4-a716-446655440000";
    const replacementId = "660e8400-e29b-41d4-a716-446655440000";
    const createResponse = await POST(request({
      action: "create",
      namePtBr: "Doações",
      nameEn: "Donations",
      ownerId: "forged",
    }));
    const editResponse = await POST(request({
      action: "edit",
      id: categoryId,
      version: "2",
      namePtBr: "Cursos",
      nameEn: "Courses",
    }));
    const deactivateResponse = await POST(request({
      action: "deactivate",
      id: categoryId,
      version: "3",
      replacementId,
    }));

    expect(create).toHaveBeenCalledWith(owner, { namePtBr: "Doações", nameEn: "Donations" });
    expect(update).toHaveBeenCalledWith(owner, categoryId, "2", { namePtBr: "Cursos", nameEn: "Courses" });
    expect(deactivate).toHaveBeenCalledWith(owner, categoryId, "3", replacementId);
    expect(createResponse.headers.get("location")).toBe("/?categories=create");
    expect(editResponse.headers.get("location")).toBe("/?categories=edit");
    expect(deactivateResponse.headers.get("location")).toBe("/?categories=deactivate");
  });

  it("maps all unavailable category mutations to one opaque conflict redirect", async () => {
    update.mockRejectedValueOnce(new ProductCategoryConflictError());
    const response = await POST(request({
      action: "edit",
      id: "550e8400-e29b-41d4-a716-446655440000",
      version: "0",
      namePtBr: "Unknown",
      nameEn: "Unknown",
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?categories=conflict");
    expect(await response.text()).toBe("");
  });
});

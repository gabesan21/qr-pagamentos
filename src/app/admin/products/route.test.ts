import { describe, expect, it, vi } from "vitest";

const { requireAdminFromCookie, protectedMutationResponse, create, update, setActive, deleteProduct } = vi.hoisted(
  () => ({
    requireAdminFromCookie: vi.fn(),
    protectedMutationResponse: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setActive: vi.fn(),
    deleteProduct: vi.fn(),
  }),
);

vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock(import("@/auth/product"), async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/product")>();
  return {
    ...actual,
    getProductService: () => ({ list: vi.fn(), create, update, setActive, delete: deleteProduct }),
  };
});

import { ProductConflictError } from "@/auth/product";
import { POST } from "./route";

const actor = {
  id: "admin",
  username: "admin",
  email: null,
  role: "ADMIN" as const,
  status: "ACTIVE" as const,
  createdAt: new Date(),
};
const productValues = {
  internalName: "Donation",
  titlePtBr: "Doação",
  titleEn: "Donation",
  descriptionPtBr: "Apoie.",
  descriptionEn: "Support.",
  price: "10.25",
};
const request = (values: Record<string, string> = {}) =>
  new Request("http://0.0.0.0:3000/admin/products", {
    method: "POST",
    body: new URLSearchParams(values),
  });

describe("admin product mutation route", () => {
  it("returns empty protected outcomes before parsing or dispatching input", async () => {
    for (const status of [401, 403]) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("protected"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));

      const response = await POST(request());

      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    }
    expect(create).not.toHaveBeenCalled();
  });

  it("dispatches create using only the authorized cookie principal", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);

    const response = await POST(request({ action: "create", ...productValues, actorId: "attacker" }));

    expect(create).toHaveBeenCalledWith(actor, productValues);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?success=product-create");
  });

  it("dispatches update, active-state, and delete mutations with CAS inputs", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);

    const updateResponse = await POST(
      request({ action: "update", id: "product-id", version: "3", ...productValues }),
    );
    const activeResponse = await POST(
      request({ action: "active", id: "product-id", version: "4", active: "false" }),
    );
    const deleteResponse = await POST(request({ action: "delete", id: "product-id", version: "5" }));

    expect(update).toHaveBeenCalledWith(actor, "product-id", "3", productValues);
    expect(setActive).toHaveBeenCalledWith(actor, "product-id", "4", "false");
    expect(deleteProduct).toHaveBeenCalledWith(actor, "product-id", "5");
    expect(updateResponse.headers.get("location")).toBe("/admin?success=product-update");
    expect(activeResponse.headers.get("location")).toBe("/admin?success=product-active");
    expect(deleteResponse.headers.get("location")).toBe("/admin?success=product-delete");
  });

  it("maps stale and unknown products to the same opaque conflict redirect", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    update.mockRejectedValueOnce(new ProductConflictError("stale"));
    deleteProduct.mockRejectedValueOnce(new ProductConflictError("unknown"));

    const stale = await POST(request({ action: "update", id: "one", version: "0", ...productValues }));
    const unknown = await POST(request({ action: "delete", id: "two", version: "0" }));

    expect(stale.headers.get("location")).toBe("/admin?error=product-conflict");
    expect(unknown.headers.get("location")).toBe("/admin?error=product-conflict");
  });

  it("maps malformed, missing, and unsupported input to one opaque failure", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    create.mockRejectedValueOnce(new Error("validation"));

    const malformed = await POST(request({ action: "create", price: "secret-invalid-price" }));
    const unsupported = await POST(request({ action: "read", id: "secret-target" }));
    const missing = await POST(request());

    for (const response of [malformed, unsupported, missing]) {
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/admin?error=product-mutation-failed");
      expect(response.headers.get("location")).not.toContain("secret");
    }
  });
});

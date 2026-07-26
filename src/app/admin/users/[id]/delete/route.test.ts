import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireAdminFromCookie, protectedMutationResponse, deleteUser } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  protectedMutationResponse: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/administration", () => ({ getAdministrationService: () => ({ deleteUser }) }));

import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const target = { params: Promise.resolve({ id: "target" }) };
const request = (headers: Record<string, string> = { origin: "http://0.0.0.0:3000", host: "0.0.0.0:3000" }) =>
  new Request("http://0.0.0.0:3000/admin/users/target/delete", { method: "POST", headers });

describe("administrator user deletion route contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects cross-origin and missing-Origin posts before any auth or service work", async () => {
    for (const headers of [{ host: "0.0.0.0:3000" }, { origin: "https://evil.example", host: "0.0.0.0:3000" }] as Record<string, string>[]) {
      const response = await POST(request(headers), target);
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
      expect(response.headers.get("location")).toBeNull();
    }
    expect(requireAdminFromCookie).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("returns empty 401 and 403 without disclosure", async () => {
    for (const [statusCode, error] of [[401, "unauthenticated"], [403, "forbidden"]] as const) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error(error));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status: statusCode }));
      const deniedRequest = request();
      const formData = vi.spyOn(deniedRequest, "formData");

      const response = await POST(deniedRequest, target);

      expect(response.status).toBe(statusCode);
      expect(await response.text()).toBe("");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("www-authenticate")).toBeNull();
      expect(formData).not.toHaveBeenCalled();
      expect(deleteUser).not.toHaveBeenCalled();
    }
  });

  it("deletes through the re-authorized principal and redirects opaquely", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    deleteUser.mockResolvedValue(undefined);

    const response = await POST(request(), target);

    expect(deleteUser).toHaveBeenCalledWith(actor, "target");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?success=deleted");
  });

  it.each(["unknown target", "already deleted", "final administrator"])("shares one opaque failure redirect for %s", async (cause) => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    deleteUser.mockRejectedValueOnce(new Error(cause));

    const response = await POST(request(), target);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?error=change-failed");
    expect(response.headers.get("location")).not.toContain("target");
  });
});

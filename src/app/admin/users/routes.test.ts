import { describe, expect, it, vi } from "vitest";

const { requireAdminFromCookie, protectedMutationResponse, createUser, changePassword, changeRole, changeStatus } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  protectedMutationResponse: vi.fn(),
  createUser: vi.fn(),
  changePassword: vi.fn(),
  changeRole: vi.fn(),
  changeStatus: vi.fn(),
}));

vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/administration", () => ({ getAdministrationService: () => ({ createUser, changePassword, changeRole, changeStatus }) }));

import { POST as create } from "./route";
import { POST as password } from "./[id]/password/route";
import { POST as role } from "./[id]/role/route";
import { POST as status } from "./[id]/status/route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const request = (body = new URLSearchParams(), headers: Record<string, string> = { origin: "http://0.0.0.0:3000", host: "0.0.0.0:3000" }) =>
  new Request("http://0.0.0.0:3000/admin/users/target", { method: "POST", headers, body });
const target = { params: Promise.resolve({ id: "target" }) };

describe("administrative mutation route contract", () => {
  it.each([
    ["create", (form: URLSearchParams, headers?: Record<string, string>) => create(request(form, headers)), new URLSearchParams()],
    ["role", (form: URLSearchParams, headers?: Record<string, string>) => role(request(form, headers), target), new URLSearchParams({ role: "ADMIN" })],
    ["status", (form: URLSearchParams, headers?: Record<string, string>) => status(request(form, headers), target), new URLSearchParams({ status: "DISABLED" })],
    ["password", (form: URLSearchParams, headers?: Record<string, string>) => password(request(form, headers), target), new URLSearchParams({ password: "correct horse battery staple" })],
  ] as const)("rejects cross-origin and missing-Origin posts for %s before any auth or service work", async (_name, handler, form) => {
    for (const headers of [{ host: "0.0.0.0:3000" }, { origin: "https://evil.example", host: "0.0.0.0:3000" }] as Record<string, string>[]) {
      const response = await handler(form, headers);
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
      expect(response.headers.get("location")).toBeNull();
    }
    expect(requireAdminFromCookie).not.toHaveBeenCalled();
  });
  it.each([
    ["create", (form: URLSearchParams) => create(request(form)), new URLSearchParams()],
    ["role", (form: URLSearchParams) => role(request(form), target), new URLSearchParams({ role: "ADMIN" })],
    ["status", (form: URLSearchParams) => status(request(form), target), new URLSearchParams({ status: "DISABLED" })],
    ["password", (form: URLSearchParams) => password(request(form), target), new URLSearchParams({ password: "correct horse battery staple" })],
  ] as const)("returns empty 401 and 403 without disclosure for %s", async (_name, handler, form) => {
    for (const [statusCode, error] of [[401, "unauthenticated"], [403, "forbidden"]] as const) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error(error));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status: statusCode }));
      const response = await handler(form);
      expect(response.status).toBe(statusCode);
      expect(await response.text()).toBe("");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("www-authenticate")).toBeNull();
    }
  });

  it("uses only the re-authorized principal and opaque authorized redirects", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    createUser.mockResolvedValue({});
    const created = await create(request(new URLSearchParams({ username: "new.user", password: "correct horse battery staple", role: "USER", actorId: "attacker" })));
    expect(createUser).toHaveBeenCalledWith(actor, expect.objectContaining({ username: "new.user", role: "USER" }));
    expect(created.status).toBe(303);
    expect(created.headers.get("location")).toBe("/admin?success=created");

    for (const [handler, form] of [[role, new URLSearchParams({ role: "USER" })], [status, new URLSearchParams({ status: "DISABLED" })], [password, new URLSearchParams({ password: "correct horse battery staple" })]] as const) {
      requireAdminFromCookie.mockResolvedValue(actor);
      const response = await handler(request(form), target);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/admin?success=" + (handler === role ? "role" : handler === status ? "status" : "password"));
    }
  });

  it.each([
    ["role", role, changeRole, new URLSearchParams({ role: "USER" })],
    ["status", status, changeStatus, new URLSearchParams({ status: "DISABLED" })],
    ["password", password, changePassword, new URLSearchParams({ password: "correct horse battery staple" })],
  ] as const)("maps an unknown %s target to the generic failure redirect", async (_operation, handler, mutation, form) => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    mutation.mockRejectedValueOnce(new Error("unknown target"));
    const response = await handler(request(form), target);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?error=change-failed");
    expect(response.headers.get("location")).not.toContain("target");
  });
});

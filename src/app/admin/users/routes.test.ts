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
const request = (body = new URLSearchParams()) => new Request("https://example.test/admin/users/target", { method: "POST", body });
const target = { params: Promise.resolve({ id: "target" }) };

describe("administrative mutation route contract", () => {
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
    expect(created.headers.get("location")).toBe("https://example.test/admin?success=created");

    for (const [handler, form] of [[role, new URLSearchParams({ role: "USER" })], [status, new URLSearchParams({ status: "DISABLED" })], [password, new URLSearchParams({ password: "correct horse battery staple" })]] as const) {
      requireAdminFromCookie.mockResolvedValue(actor);
      const response = await handler(request(form), target);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("https://example.test/admin?success=" + (handler === role ? "role" : handler === status ? "status" : "password"));
    }
  });

  it("maps unknown or final-admin service failures to the same generic redirect", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    changeStatus.mockRejectedValueOnce(new Error("unknown or protected"));
    const response = await status(request(new URLSearchParams({ status: "DISABLED" })), target);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.test/admin?error=change-failed");
    expect(response.headers.get("location")).not.toContain("target");
  });
});

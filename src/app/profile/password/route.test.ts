import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { requireOwner, protectedResponse, changePassword } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  protectedResponse: vi.fn(),
  changePassword: vi.fn(),
}));
vi.mock("@/app/owner-guard", () => ({
  requireOwnerFromCookie: requireOwner,
  ownerProtectedMutationResponse: protectedResponse,
}));
vi.mock("@/auth/profile", () => ({ getProfileService: () => ({ changePassword }) }));

import { POST } from "./route";

const actor = { id: "owner", username: "owner", email: null, role: "USER", status: "ACTIVE", createdAt: new Date() };
const headers = { origin: "http://local", host: "local" };
function request(values: Record<string, string>, requestHeaders: Record<string, string> = headers) {
  return new Request("http://local/profile/password", { method: "POST", headers: requestHeaders, body: new URLSearchParams(values) });
}

describe("profile password route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects origin and protected principals before parsing", async () => {
    expect((await POST(request({}, { host: "local" }))).status).toBe(403);
    expect(requireOwner).not.toHaveBeenCalled();
    requireOwner.mockRejectedValue(new Error("protected"));
    protectedResponse.mockReturnValue(new Response(null, { status: 403 }));
    const denied = request({ currentPassword: "secret" });
    const parse = vi.spyOn(denied, "formData");
    expect((await POST(denied)).status).toBe(403);
    expect(parse).not.toHaveBeenCalled();
  });

  it("clears the session only on success and exposes no submitted value", async () => {
    requireOwner.mockResolvedValue(actor);
    protectedResponse.mockReturnValue(null);
    const success = await POST(request({
      currentPassword: "current secret phrase",
      newPassword: "replacement phrase",
      confirmation: "replacement phrase",
      target: "forged",
    }));
    expect(changePassword).toHaveBeenCalledWith(actor, {
      currentPassword: "current secret phrase",
      newPassword: "replacement phrase",
      confirmation: "replacement phrase",
    });
    expect(success.headers.get("location")).toBe("/login?password=changed");
    expect(success.headers.get("set-cookie")).toMatch(/qr_session=;.*Path=\/.*Max-Age=0.*HttpOnly.*SameSite=lax/i);

    changePassword.mockRejectedValue(new Error("private detail"));
    const failed = await POST(request({ currentPassword: "secret", newPassword: "new secret phrase", confirmation: "new secret phrase" }));
    expect(failed.headers.get("location")).toBe("/profile?password=failed");
    expect(failed.headers.get("set-cookie")).toBeNull();
    expect(`${await failed.text()}${failed.headers.get("location")}`).not.toMatch(/secret|private detail|forged/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { requireOwner, protectedResponse, changePassword, isEnrolled, createSession, createMfaVerifiedSession } = vi.hoisted(() => ({
  requireOwner: vi.fn(),
  protectedResponse: vi.fn(),
  changePassword: vi.fn(),
  isEnrolled: vi.fn(),
  createSession: vi.fn(),
  createMfaVerifiedSession: vi.fn(),
}));
vi.mock("@/app/owner-guard", () => ({
  requireOwnerFromCookie: requireOwner,
  ownerProtectedMutationResponse: protectedResponse,
}));
vi.mock("@/auth/profile", () => ({ getProfileService: () => ({ changePassword }) }));
vi.mock("@/auth/totp-store", () => ({ getTotpService: () => ({ isEnrolled }) }));
vi.mock("@/auth/session", () => ({
  getSessionService: () => ({ create: createSession, createMfaVerified: createMfaVerifiedSession }),
  SESSION_ABSOLUTE_MS: 12 * 60 * 60 * 1000,
}));

import { POST } from "./route";

const actor = { id: "owner", username: "owner", email: null, role: "USER", status: "ACTIVE", createdAt: new Date() };
const headers = { origin: "http://local", host: "local" };
function request(values: Record<string, string>, requestHeaders: Record<string, string> = headers) {
  return new Request("http://local/profile/password", { method: "POST", headers: requestHeaders, body: new URLSearchParams(values) });
}

describe("profile password route", () => {
  beforeEach(() => {
    requireOwner.mockReset();
    protectedResponse.mockReset();
    changePassword.mockReset().mockResolvedValue(undefined);
    isEnrolled.mockReset().mockResolvedValue(false);
    createSession.mockReset().mockResolvedValue("fresh-session-token");
    createMfaVerifiedSession.mockReset().mockResolvedValue("fresh-mfa-session-token");
  });

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

  it("rotates the session only on success and exposes no submitted value", async () => {
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
    expect(success.headers.get("location")).toBe("/profile?password=changed");
    expect(success.headers.get("set-cookie")).toMatch(/qr_session=fresh-session-token;.*Path=\/.*HttpOnly.*SameSite=lax/i);
    expect(createSession).toHaveBeenCalledWith(actor.id);
    expect(createMfaVerifiedSession).not.toHaveBeenCalled();
    expect(changePassword.mock.invocationCallOrder[0]).toBeLessThan(createSession.mock.invocationCallOrder[0]);

    changePassword.mockRejectedValue(new Error("private detail"));
    const failed = await POST(request({ currentPassword: "secret", newPassword: "new secret phrase", confirmation: "new secret phrase" }));
    expect(failed.headers.get("location")).toBe("/profile?password=failed");
    expect(failed.headers.get("set-cookie")).toBeNull();
    expect(`${await failed.text()}${failed.headers.get("location")}`).not.toMatch(/secret|private detail|forged/);
  });

  it("issues an MFA-verified session when the actor has TOTP enrolled", async () => {
    requireOwner.mockResolvedValue(actor);
    protectedResponse.mockReturnValue(null);
    isEnrolled.mockResolvedValue(true);
    const response = await POST(request({
      currentPassword: "current secret phrase",
      newPassword: "replacement phrase",
      confirmation: "replacement phrase",
    }));
    expect(response.headers.get("location")).toBe("/profile?password=changed");
    expect(createMfaVerifiedSession).toHaveBeenCalledWith(actor.id);
    expect(createSession).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("qr_session=fresh-mfa-session-token");
  });

  it("keeps the merchant signed in on /profile across repeated password changes", async () => {
    requireOwner.mockResolvedValue(actor);
    protectedResponse.mockReturnValue(null);
    for (const token of ["session-a", "session-b"]) {
      createSession.mockResolvedValueOnce(token);
      const response = await POST(request({
        currentPassword: "current secret phrase",
        newPassword: "replacement phrase",
        confirmation: "replacement phrase",
      }));
      expect(response.headers.get("location")).toBe("/profile?password=changed");
      expect(response.headers.get("set-cookie")).toContain(`qr_session=${token}`);
    }
  });
});

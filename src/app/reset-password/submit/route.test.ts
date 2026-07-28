import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { rejectCrossOrigin } = vi.hoisted(() => ({ rejectCrossOrigin: vi.fn() }));
vi.mock("@/app/origin-guard", () => ({ rejectCrossOrigin }));

const { consumeResetChallenge, PasswordResetValidationError, PasswordResetUnavailableError } = vi.hoisted(() => ({
  consumeResetChallenge: vi.fn(),
  PasswordResetValidationError: class PasswordResetValidationError extends Error {},
  PasswordResetUnavailableError: class PasswordResetUnavailableError extends Error {},
}));
vi.mock("@/auth/password-reset", () => ({
  getPasswordResetService: () => ({ consumeResetChallenge }),
  PasswordResetValidationError,
  PasswordResetUnavailableError,
}));

import { POST } from "./route";

const sameOrigin = { origin: "http://local", host: "local" };
const request = (body: Record<string, string>, headers: Record<string, string> = sameOrigin) =>
  new Request("http://local/reset-password/submit", {
    method: "POST",
    headers,
    body: new URLSearchParams(body),
  });

describe("public password reset consume route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rejectCrossOrigin.mockReturnValue(null);
  });

  it("rejects cross-origin and missing-Origin posts before any service work", async () => {
    for (const headers of [{ host: "local" }, { origin: "https://evil.example", host: "local" }] as Record<string, string>[]) {
      rejectCrossOrigin.mockReturnValueOnce(new Response(null, { status: 403 }));
      const response = await POST(request({ token: "valid-token", newPassword: "new strong password", confirmation: "new strong password" }, headers));
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
    }
    expect(consumeResetChallenge).not.toHaveBeenCalled();
  });

  it("consumes a valid challenge and redirects to the login completion notice", async () => {
    consumeResetChallenge.mockResolvedValueOnce(undefined);

    const response = await POST(request({ token: "valid-token", newPassword: "new strong password", confirmation: "new strong password" }));

    expect(consumeResetChallenge).toHaveBeenCalledWith("valid-token", "new strong password");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?password=changed");
  });

  it("redirects opaquely when the confirmation does not match the new password", async () => {
    const response = await POST(request({ token: "valid-token", newPassword: "new strong password", confirmation: "different password" }));

    expect(consumeResetChallenge).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/reset-password?token=valid-token&error=failed");
  });

  it("redirects opaquely when the token is missing", async () => {
    const response = await POST(request({ newPassword: "new strong password", confirmation: "new strong password" }));

    expect(consumeResetChallenge).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/reset-password?token=&error=failed");
  });

  it("redirects opaquely when the new password is invalid", async () => {
    consumeResetChallenge.mockRejectedValueOnce(new PasswordResetValidationError("Password is invalid"));

    const response = await POST(request({ token: "valid-token", newPassword: "short", confirmation: "short" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/reset-password?token=valid-token&error=failed");
  });

  it("redirects opaquely when the challenge is unavailable", async () => {
    consumeResetChallenge.mockRejectedValueOnce(new PasswordResetUnavailableError("Reset is unavailable"));

    const response = await POST(request({ token: "expired-token", newPassword: "new strong password", confirmation: "new strong password" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/reset-password?token=expired-token&error=failed");
  });

  it("redirects opaquely on unexpected service errors", async () => {
    consumeResetChallenge.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(request({ token: "valid-token", newPassword: "new strong password", confirmation: "new strong password" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/reset-password?token=valid-token&error=failed");
  });
});

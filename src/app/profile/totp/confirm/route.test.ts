import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireOwner = vi.hoisted(() => vi.fn());
beforeEach(() => vi.resetAllMocks());
const verifyPassword = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie: requireOwner, ownerProtectedMutationResponse: (error: unknown) => (error instanceof Error && error.message === "unauthenticated") ? new Response(null, { status: 401 }) : null }));
vi.mock("@/auth/password-verification", () => ({ verifyCurrentPassword: verifyPassword }));
vi.mock("@/auth/totp-store", () => ({ getTotpService: () => ({ confirm }) }));

import { POST } from "./route";

const sameOrigin = { origin: "http://local", host: "local" };
const request = (currentPassword = "correct", code = "123456") =>
  new Request("http://local/profile/totp/confirm", { method: "POST", headers: sameOrigin, body: new URLSearchParams({ currentPassword, code }) });

describe("profile TOTP confirm route", () => {
  it("confirms with valid password and code", async () => {
    requireOwner.mockResolvedValueOnce({ id: "user-1" });
    verifyPassword.mockResolvedValueOnce(true);
    confirm.mockResolvedValueOnce(undefined);
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/profile?totp=confirmed");
  });

  it("redirects to failed on bad password", async () => {
    requireOwner.mockResolvedValueOnce({ id: "user-1" });
    verifyPassword.mockResolvedValueOnce(false);
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/profile?totp=failed");
  });

  it("redirects to failed on invalid code", async () => {
    requireOwner.mockResolvedValueOnce({ id: "user-1" });
    verifyPassword.mockResolvedValueOnce(true);
    confirm.mockRejectedValueOnce(new Error("invalid"));
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/profile?totp=failed");
  });

  it("returns 401 for unauthenticated owners", async () => {
    requireOwner.mockRejectedValueOnce(new Error("unauthenticated"));
    const response = await POST(request());
    expect(response.status).toBe(401);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const cookies = vi.hoisted(() => ({ get: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: cookies.get }) }));

const validateChallenge = vi.hoisted(() => vi.fn());
const validateTotp = vi.hoisted(() => vi.fn());
const validateRecovery = vi.hoisted(() => vi.fn());
const createMfaVerified = vi.hoisted(() => vi.fn());
vi.mock("@/auth/mfa-challenge", () => ({ getMfaChallengeService: () => ({ validate: validateChallenge }) }));
vi.mock("@/auth/totp-store", () => ({ getTotpService: () => ({ validate: validateTotp, validateWithRecoveryCode: validateRecovery }) }));
vi.mock("@/auth/session", () => ({ getSessionService: () => ({ createMfaVerified }), SESSION_ABSOLUTE_MS: 3_600_000 }));

import { POST } from "./route";

const sameOrigin = { origin: "http://local", host: "local" };
const request = (code = "123456") =>
  new Request("http://local/login/totp-challenge", { method: "POST", headers: sameOrigin, body: new URLSearchParams({ code }) });

describe("login TOTP challenge route", () => {
  it("rejects cross-origin posts", async () => {
    const response = await POST(new Request("http://local/login/totp-challenge", { method: "POST", headers: { host: "local" }, body: new URLSearchParams({ code: "123456" }) }));
    expect(response.status).toBe(403);
  });

  it("creates a session on valid TOTP code", async () => {
    cookies.get.mockReturnValueOnce({ value: "challenge-token" });
    validateChallenge.mockResolvedValueOnce({ userId: "user-1" });
    validateTotp.mockResolvedValueOnce(true);
    validateRecovery.mockResolvedValueOnce(false);
    createMfaVerified.mockResolvedValueOnce("session-token");
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("qr_session=session-token");
    expect(setCookie).toContain("qr_mfa_challenge=");
  });

  it("creates a session on valid recovery code", async () => {
    cookies.get.mockReturnValueOnce({ value: "challenge-token" });
    validateChallenge.mockResolvedValueOnce({ userId: "user-1" });
    validateTotp.mockResolvedValueOnce(false);
    validateRecovery.mockResolvedValueOnce(true);
    createMfaVerified.mockResolvedValueOnce("session-token");
    const response = await POST(request("a".repeat(32)));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
  });

  it("redirects to failed on invalid code", async () => {
    cookies.get.mockReturnValueOnce({ value: "challenge-token" });
    validateChallenge.mockResolvedValueOnce({ userId: "user-1" });
    validateTotp.mockResolvedValueOnce(false);
    validateRecovery.mockResolvedValueOnce(false);
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?mfa=failed");
  });

  it("redirects to invalid-credentials when challenge is missing", async () => {
    cookies.get.mockReturnValueOnce(undefined);
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?error=invalid-credentials");
  });
});

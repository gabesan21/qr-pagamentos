import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { signIn, resolvePrincipal, resolveLocale, logout, createMfaVerified } = vi.hoisted(() => ({ signIn: vi.fn(), resolvePrincipal: vi.fn(), resolveLocale: vi.fn(), logout: vi.fn(), createMfaVerified: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const isEnrolled = vi.hoisted(() => vi.fn());
const createChallenge = vi.hoisted(() => vi.fn());
vi.mock("@/auth/session", () => ({ getSessionService: () => ({ signIn, logout, createMfaVerified }), SESSION_ABSOLUTE_MS: 3_600_000 }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: resolvePrincipal }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/i18n/locales", () => ({ negotiateLocale: () => "en" }));
vi.mock("@/auth/totp-store", () => ({ getTotpService: () => ({ isEnrolled }) }));
vi.mock("@/auth/mfa-challenge", () => ({ getMfaChallengeService: () => ({ create: createChallenge }) }));

import { POST } from "./route";

const sameOrigin = { origin: "http://local", host: "local" };
const request = (headers: Record<string, string> = sameOrigin) =>
  new Request("http://local/login/submit", { method: "POST", headers, body: new URLSearchParams({ username: "owner", password: "correct horse battery staple" }) });

describe("owner login submit route", () => {
  it("rejects cross-origin and missing-Origin posts before any sign-in work", async () => {
    for (const headers of [{ host: "local" }, { origin: "https://evil.example", host: "local" }] as Record<string, string>[]) {
      const response = await POST(request(headers));
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in same-origin posts and sets the session cookie", async () => {
    signIn.mockResolvedValueOnce("opaque-token");
    resolvePrincipal.mockResolvedValueOnce({ id: "owner", role: "USER" });
    resolveLocale.mockResolvedValueOnce(undefined);
    isEnrolled.mockResolvedValueOnce(false);
    const response = await POST(request());
    expect(signIn).toHaveBeenCalledWith("owner", "correct horse battery staple");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toContain("qr_session=opaque-token");
  });

  it("issues an MFA challenge when TOTP is active", async () => {
    signIn.mockResolvedValueOnce("opaque-token");
    resolvePrincipal.mockResolvedValueOnce({ id: "owner", role: "USER" });
    resolveLocale.mockResolvedValueOnce(undefined);
    isEnrolled.mockResolvedValueOnce(true);
    createChallenge.mockResolvedValueOnce("challenge-token");
    const response = await POST(request());
    expect(logout).toHaveBeenCalledWith("opaque-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?mfa=required");
    expect(response.headers.get("set-cookie")).toContain("qr_mfa_challenge=challenge-token");
    expect(response.headers.get("set-cookie")).not.toContain("qr_session=");
  });
});

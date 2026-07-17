import { beforeEach, describe, expect, it, vi } from "vitest";

const { signIn, resolvePrincipal, resolve, negotiateLocale } = vi.hoisted(() => ({
  signIn: vi.fn(),
  resolvePrincipal: vi.fn(),
  resolve: vi.fn(),
  negotiateLocale: vi.fn(),
}));

vi.mock("@/auth/session", () => ({
  getSessionService: () => ({ signIn }),
  SESSION_ABSOLUTE_MS: 60_000,
}));
vi.mock("@/auth/authorization", () => ({
  getAuthorizationService: () => ({ resolve: resolvePrincipal }),
}));
vi.mock("@/i18n/locale-preference", () => ({
  getLocalePreferenceService: () => ({ resolve }),
}));
vi.mock("@/i18n/locales", () => ({ negotiateLocale }));

import { POST } from "../app/login/submit/route";

describe("POST /login/submit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("seeds the authenticated user's first preference from the negotiated header before redirecting", async () => {
    signIn.mockResolvedValueOnce("session-token");
    resolvePrincipal.mockResolvedValueOnce({ id: "principal" });
    negotiateLocale.mockReturnValueOnce("en");
    resolve.mockResolvedValueOnce("en");

    const response = await POST(new Request("https://example.test/login/submit", {
      method: "POST",
      headers: { "accept-language": "en-US,en;q=0.9" },
      body: new URLSearchParams({ username: "admin", password: "correct-password" }),
    }));

    expect(negotiateLocale).toHaveBeenCalledWith("en-US,en;q=0.9");
    expect(resolve).toHaveBeenCalledWith("principal", "en");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toMatch(/^qr_session=session-token; Path=\/; Expires=.+; Max-Age=60; HttpOnly; SameSite=lax$/);
  });

  it("keeps the browser's public origin when credentials are invalid behind a container proxy", async () => {
    signIn.mockResolvedValueOnce(null);

    const response = await POST(new Request("http://0.0.0.0:3000/login/submit", {
      method: "POST",
      body: new URLSearchParams({ username: "admin", password: "wrong-password" }),
    }));

    expect(resolve).not.toHaveBeenCalled();
    expect(resolvePrincipal).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login?error=invalid-credentials");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not disguise an infrastructure failure as invalid credentials", async () => {
    signIn.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(POST(new Request("https://example.test/login/submit", {
      method: "POST",
      body: new URLSearchParams({ username: "admin", password: "correct-password" }),
    }))).rejects.toThrow("database unavailable");

    expect(resolvePrincipal).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });
});

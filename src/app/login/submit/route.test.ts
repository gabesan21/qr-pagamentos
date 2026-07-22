import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { signIn, resolvePrincipal, resolveLocale } = vi.hoisted(() => ({ signIn: vi.fn(), resolvePrincipal: vi.fn(), resolveLocale: vi.fn() }));
vi.mock("@/auth/session", () => ({ getSessionService: () => ({ signIn }), SESSION_ABSOLUTE_MS: 3_600_000 }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: resolvePrincipal }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ resolve: resolveLocale }) }));
vi.mock("@/i18n/locales", () => ({ negotiateLocale: () => "en" }));

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
    resolvePrincipal.mockResolvedValueOnce({ id: "owner" });
    resolveLocale.mockResolvedValueOnce(undefined);
    const response = await POST(request());
    expect(signIn).toHaveBeenCalledWith("owner", "correct horse battery staple");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.get("set-cookie")).toContain("qr_session=opaque-token");
  });
});

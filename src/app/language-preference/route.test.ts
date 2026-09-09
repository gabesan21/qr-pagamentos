import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const resolvePrincipal = vi.fn();
const set = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-token" }) }) }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: resolvePrincipal }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ set }) }));

import { POST } from "./route";

describe("POST /language-preference", () => {
  it("redirects an anonymous write with a qr_locale cookie, leaving qr_session untouched", async () => {
    resolvePrincipal.mockResolvedValueOnce(null);
    const response = await POST(new Request("https://example.test/language-preference", {
      method: "POST",
      headers: { origin: "https://example.test", host: "example.test" },
      body: new URLSearchParams({ locale: "en" }),
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?language=saved");
    expect(set).not.toHaveBeenCalled();
    const cookieHeader = response.headers.get("set-cookie") ?? "";
    expect(cookieHeader).toContain("qr_locale=en");
    expect(cookieHeader).not.toContain("qr_session");
  });

  it("redirects an anonymous write with an unsupported locale to the error state without setting a cookie", async () => {
    resolvePrincipal.mockResolvedValueOnce(null);
    const response = await POST(new Request("https://example.test/language-preference", {
      method: "POST",
      headers: { origin: "https://example.test", host: "example.test" },
      body: new URLSearchParams({ locale: "xx" }),
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?language=error");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("writes only the authenticated principal and redirects without a locale prefix", async () => {
    resolvePrincipal.mockResolvedValueOnce({ id: "principal" });
    set.mockResolvedValueOnce(undefined);
    const response = await POST(new Request("http://0.0.0.0:3000/language-preference", { method: "POST", headers: { origin: "http://0.0.0.0:3000", host: "0.0.0.0:3000" }, body: new URLSearchParams({ locale: "en", userId: "other-user" }) }));
    expect(set).toHaveBeenCalledWith("principal", "en");
    expect(response.headers.get("location")).toBe("/?language=saved");
  });

  it("redirects invalid values to a localized error recovery state", async () => {
    resolvePrincipal.mockResolvedValueOnce({ id: "principal" });
    set.mockRejectedValueOnce(new Error("Invalid locale"));
    const response = await POST(new Request("https://example.test/language-preference", { method: "POST", headers: { origin: "https://example.test", host: "example.test" }, body: new URLSearchParams({ locale: "es" }) }));
    expect(response.headers.get("location")).toBe("/?language=error");
  });

  it("returns to /settings with the section anchor when the switcher posted from there", async () => {
    resolvePrincipal.mockResolvedValueOnce({ id: "principal" });
    set.mockResolvedValueOnce(undefined);
    const response = await POST(new Request("http://local/language-preference", {
      method: "POST",
      headers: { origin: "http://local", host: "local", referer: "http://local/settings" },
      body: new URLSearchParams({ locale: "en" }),
    }));
    expect(response.headers.get("location")).toBe("/settings?language=saved#settings-language");
  });

  it("returns to / with no anchor when the switcher posted from the dashboard", async () => {
    resolvePrincipal.mockResolvedValueOnce({ id: "principal" });
    set.mockResolvedValueOnce(undefined);
    const response = await POST(new Request("http://local/language-preference", {
      method: "POST",
      headers: { origin: "http://local", host: "local", referer: "http://local/" },
      body: new URLSearchParams({ locale: "en" }),
    }));
    expect(response.headers.get("location")).toBe("/?language=saved");
  });

  it("falls back to / for a foreign-host Referer, never trusting it as an open redirect", async () => {
    resolvePrincipal.mockResolvedValueOnce({ id: "principal" });
    set.mockResolvedValueOnce(undefined);
    const response = await POST(new Request("http://local/language-preference", {
      method: "POST",
      headers: { origin: "http://local", host: "local", referer: "https://evil.example/settings" },
      body: new URLSearchParams({ locale: "en" }),
    }));
    expect(response.headers.get("location")).toBe("/?language=saved");
  });
});

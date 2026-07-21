import { describe, expect, it, vi } from "vitest";

const resolvePrincipal = vi.fn();
const set = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-token" }) }) }));
vi.mock("@/auth/authorization", () => ({ getAuthorizationService: () => ({ resolve: resolvePrincipal }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ set }) }));

import { POST } from "./route";

describe("POST /language-preference", () => {
  it("rejects unauthenticated writes", async () => {
    resolvePrincipal.mockResolvedValueOnce(null);
    expect((await POST(new Request("https://example.test/language-preference", { method: "POST", headers: { origin: "https://example.test", host: "example.test" } }))).status).toBe(401);
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
});

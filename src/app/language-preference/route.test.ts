import { describe, expect, it, vi } from "vitest";

const validate = vi.fn();
const set = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-token" }) }) }));
vi.mock("@/auth/session", () => ({ getSessionService: () => ({ validate }) }));
vi.mock("@/i18n/locale-preference", () => ({ getLocalePreferenceService: () => ({ set }) }));

import { POST } from "./route";

describe("POST /language-preference", () => {
  it("rejects unauthenticated writes", async () => {
    validate.mockResolvedValueOnce(null);
    expect((await POST(new Request("https://example.test/language-preference", { method: "POST" }))).status).toBe(401);
  });

  it("writes only the authenticated principal and redirects without a locale prefix", async () => {
    validate.mockResolvedValueOnce({ userId: "principal" });
    set.mockResolvedValueOnce(undefined);
    const response = await POST(new Request("https://example.test/language-preference", { method: "POST", body: new URLSearchParams({ locale: "en", userId: "other-user" }) }));
    expect(set).toHaveBeenCalledWith("principal", "en");
    expect(response.headers.get("location")).toBe("https://example.test/?language=saved");
  });

  it("redirects invalid values to a localized error recovery state", async () => {
    validate.mockResolvedValueOnce({ userId: "principal" });
    set.mockRejectedValueOnce(new Error("Invalid locale"));
    const response = await POST(new Request("https://example.test/language-preference", { method: "POST", body: new URLSearchParams({ locale: "es" }) }));
    expect(response.headers.get("location")).toBe("https://example.test/?language=error");
  });
});

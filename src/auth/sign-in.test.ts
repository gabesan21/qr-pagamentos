import { beforeEach, describe, expect, it, vi } from "vitest";

const { signIn, validate, resolve, negotiateLocale } = vi.hoisted(() => ({
  signIn: vi.fn(),
  validate: vi.fn(),
  resolve: vi.fn(),
  negotiateLocale: vi.fn(),
}));

vi.mock("@/auth/session", () => ({
  getSessionService: () => ({ signIn, validate }),
  SESSION_ABSOLUTE_MS: 60_000,
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
    validate.mockResolvedValueOnce({ userId: "principal" });
    negotiateLocale.mockReturnValueOnce("en");
    resolve.mockResolvedValueOnce("en");

    const response = await POST(new Request("https://example.test/login/submit", {
      method: "POST",
      headers: { "accept-language": "en-US,en;q=0.9" },
      body: new URLSearchParams({ username: "admin", password: "correct-password" }),
    }));

    expect(negotiateLocale).toHaveBeenCalledWith("en-US,en;q=0.9");
    expect(resolve).toHaveBeenCalledWith("principal", "en");
    expect(response.headers.get("location")).toBe("https://example.test/");
  });

  it("does not seed a preference when credentials are invalid", async () => {
    signIn.mockResolvedValueOnce(null);

    const response = await POST(new Request("https://example.test/login/submit", {
      method: "POST",
      body: new URLSearchParams({ username: "admin", password: "wrong-password" }),
    }));

    expect(resolve).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://example.test/login?error=invalid-credentials");
  });
});

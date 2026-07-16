import { describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
vi.mock("../../../../auth/session", () => ({ SESSION_ABSOLUTE_MS: 43_200_000, getSessionService: () => ({ signIn }) }));

import { POST } from "./route";

function request(form: Record<string, string>) {
  return new Request("https://example.test/en/login/submit", { method: "POST", body: new URLSearchParams(form) });
}

describe("POST /[lang]/login/submit", () => {
  it("sets an opaque HttpOnly Lax cookie and redirects after success", async () => {
    signIn.mockResolvedValueOnce("opaque-token");
    const response = await POST(request({ username: "admin", password: "correct horse battery staple" }), { params: Promise.resolve({ lang: "en" }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.test/en");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("qr_session=opaque-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  it("uses one generic redirect for invalid credentials", async () => {
    signIn.mockResolvedValueOnce(null);
    const response = await POST(request({ username: "missing", password: "wrong" }), { params: Promise.resolve({ lang: "pt-BR" }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.test/pt-BR/login?error=invalid-credentials");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

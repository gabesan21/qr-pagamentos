import { describe, expect, it, vi } from "vitest";

const logout = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-token" }) }) }));
vi.mock("../../../auth/session", () => ({ getSessionService: () => ({ logout }) }));

import { POST } from "./route";

describe("POST /[lang]/logout", () => {
  it("revokes the presented token and expires its HttpOnly cookie", async () => {
    const response = await POST(new Request("https://example.test/en/logout", { method: "POST" }), { params: Promise.resolve({ lang: "en" }) });
    expect(logout).toHaveBeenCalledWith("opaque-token");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.test/en/login");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

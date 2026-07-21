import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const logout = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-token" }) }) }));
vi.mock("@/auth/session", () => ({ getSessionService: () => ({ logout }) }));

import { POST } from "./route";

describe("POST /logout", () => {
  it("redirects relatively when the container request URL uses its bind address", async () => {
    logout.mockResolvedValueOnce(undefined);

    const response = await POST(new Request("http://0.0.0.0:3000/logout", { method: "POST", headers: { origin: "http://0.0.0.0:3000", host: "0.0.0.0:3000" } }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("set-cookie")).toContain("qr_session=");
  });

  it("rejects a cross-origin post before touching the session", async () => {
    logout.mockClear();
    const response = await POST(new Request("http://0.0.0.0:3000/logout", { method: "POST", headers: { origin: "https://evil.example", host: "0.0.0.0:3000" } }));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(logout).not.toHaveBeenCalled();
  });
});

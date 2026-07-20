import { describe, expect, it, vi } from "vitest";

const logout = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-token" }) }) }));
vi.mock("@/auth/session", () => ({ getSessionService: () => ({ logout }) }));

import { POST } from "./route";

describe("POST /logout", () => {
  it("redirects relatively when the container request URL uses its bind address", async () => {
    logout.mockResolvedValueOnce(undefined);

    const response = await POST();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(response.headers.get("set-cookie")).toContain("qr_session=");
  });
});

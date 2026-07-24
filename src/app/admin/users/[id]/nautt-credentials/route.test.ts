import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuthenticated } = vi.hoisted(() => ({ requireAuthenticated: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("@/auth/authorization", async (original) => ({
  ...(await original<typeof import("@/auth/authorization")>()),
  getAuthorizationService: () => ({ requireAuthenticated }),
}));

import { UnauthenticatedError } from "@/auth/authorization";
import { POST } from "./route";

const sameOrigin = { origin: "http://local", host: "local" };

function request() {
  return new Request("http://local/admin/users/target/nautt-credentials", {
    method: "POST",
    headers: sameOrigin,
    body: new URLSearchParams({ apiKey: "secret-key", userId: "target" }),
  });
}

describe("retired administrator Nautt credential route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps same-origin rejection first", async () => {
    const response = await POST(new Request("http://local/admin/users/target/nautt-credentials", { method: "POST" }));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(requireAuthenticated).not.toHaveBeenCalled();
  });

  it("returns an empty 401 without parsing input when no active principal resolves", async () => {
    requireAuthenticated.mockRejectedValue(new UnauthenticatedError());
    const deniedRequest = request();
    const formData = vi.spyOn(deniedRequest, "formData");

    const response = await POST(deniedRequest);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "USER"] as const)("returns an empty 403 without parsing input for an active %s", async (role) => {
    requireAuthenticated.mockResolvedValue({ id: role.toLowerCase(), role });
    const deniedRequest = request();
    const formData = vi.spyOn(deniedRequest, "formData");

    const response = await POST(deniedRequest);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
  });
});

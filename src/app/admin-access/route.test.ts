import { describe, expect, it, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("@/auth/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/authorization")>();
  return { ...actual, getAuthorizationService: () => ({ requireAdmin }) };
});

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import { GET } from "./route";

describe("administrator access probe", () => {
  it.each([
    [new UnauthenticatedError("missing"), 401],
    [new ForbiddenError("wrong role"), 403],
  ])("returns an empty protected denial", async (error, status) => {
    requireAdmin.mockRejectedValueOnce(error);

    const response = await GET();

    expect(response.status).toBe(status);
    expect(await response.text()).toBe("");
  });

  it("returns an empty 204 for an active administrator", async () => {
    requireAdmin.mockResolvedValueOnce({ id: "admin", role: "ADMIN" });

    const response = await GET();

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});

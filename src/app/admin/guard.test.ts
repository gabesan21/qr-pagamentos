import { describe, expect, it, vi } from "vitest";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("@/auth/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/authorization")>();
  return { ...actual, getAuthorizationService: () => ({ requireAdmin }) };
});

import { ForbiddenError } from "@/auth/authorization";
import { protectedMutationResponse, requireAdminFromCookie } from "./guard";

describe("administrator guard", () => {
  it("requires the administrator-only authorization primitive", async () => {
    const admin = { id: "admin", role: "ADMIN" };
    requireAdmin.mockResolvedValueOnce(admin);

    await expect(requireAdminFromCookie()).resolves.toBe(admin);
    expect(requireAdmin).toHaveBeenCalledWith("opaque-session");
  });

  it("maps wrong-role denials to an empty forbidden response", async () => {
    const response = protectedMutationResponse(new ForbiddenError("wrong role"));

    expect(response?.status).toBe(403);
    expect(await response?.text()).toBe("");
  });
});

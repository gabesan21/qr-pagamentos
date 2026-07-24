import { describe, expect, it, vi } from "vitest";

const { requireUser } = vi.hoisted(() => ({ requireUser: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-session" }) }) }));
vi.mock("@/auth/authorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/authorization")>();
  return { ...actual, getAuthorizationService: () => ({ requireUser }) };
});

import { ForbiddenError } from "@/auth/authorization";
import { ownerProtectedMutationResponse, requireOwnerFromCookie } from "./owner-guard";

describe("merchant owner guard", () => {
  it("requires the merchant-only authorization primitive", async () => {
    const owner = { id: "owner", role: "USER" };
    requireUser.mockResolvedValueOnce(owner);

    await expect(requireOwnerFromCookie()).resolves.toBe(owner);
    expect(requireUser).toHaveBeenCalledWith("opaque-session");
  });

  it("maps wrong-role denials to an empty forbidden response", async () => {
    const response = ownerProtectedMutationResponse(new ForbiddenError("wrong role"));

    expect(response?.status).toBe(403);
    expect(await response?.text()).toBe("");
  });
});

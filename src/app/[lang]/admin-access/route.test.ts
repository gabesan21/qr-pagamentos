import { describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("../../../auth/authorization", () => ({
  UnauthenticatedError: class UnauthenticatedError extends Error {},
  ForbiddenError: class ForbiddenError extends Error {},
  getAuthorizationService: () => ({ requireAdmin }),
}));

import { ForbiddenError, UnauthenticatedError } from "../../../auth/authorization";
import { GET } from "./route";

describe("GET /[lang]/admin-access", () => {
  it("denies anonymous and users while allowing administrators", async () => {
    requireAdmin.mockRejectedValueOnce(new UnauthenticatedError());
    expect((await GET(new Request("https://example.test/en/admin-access"), { params: Promise.resolve({ lang: "en" }) })).status).toBe(401);
    requireAdmin.mockRejectedValueOnce(new ForbiddenError());
    expect((await GET(new Request("https://example.test/en/admin-access"), { params: Promise.resolve({ lang: "en" }) })).status).toBe(403);
    requireAdmin.mockResolvedValueOnce({ id: "admin" });
    expect((await GET(new Request("https://example.test/en/admin-access"), { params: Promise.resolve({ lang: "en" }) })).status).toBe(204);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireAdmin = vi.hoisted(() => vi.fn());
beforeEach(() => vi.resetAllMocks());
const disable = vi.hoisted(() => vi.fn());
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie: requireAdmin, protectedMutationResponse: (error: unknown) => (error instanceof Error && error.message === "unauthenticated") ? new Response(null, { status: 401 }) : null }));
vi.mock("@/auth/admin-totp-recovery", () => ({ getAdminTotpRecoveryService: () => ({ disable }), AdminTotpRecoveryTargetNotFoundError: class extends Error {} }));

import { POST } from "./route";

const sameOrigin = { origin: "http://local", host: "local" };
const request = () => new Request("http://local/admin/users/u-1/totp-disable", { method: "POST", headers: sameOrigin });

describe("admin TOTP disable route", () => {
  it("rejects cross-origin posts", async () => {
    const response = await POST(new Request("http://local/admin/users/u-1/totp-disable", { method: "POST", headers: { host: "local" } }), { params: Promise.resolve({ id: "u-1" }) });
    expect(response.status).toBe(403);
  });

  it("disables TOTP and redirects on success", async () => {
    requireAdmin.mockResolvedValueOnce({ id: "admin-1", role: "ADMIN" });
    disable.mockResolvedValueOnce(undefined);
    const response = await POST(request(), { params: Promise.resolve({ id: "u-1" }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/accounts/u-1?editor=totp-disabled");
  });

  it("redirects to failed on not-found", async () => {
    const { AdminTotpRecoveryTargetNotFoundError } = await import("@/auth/admin-totp-recovery");
    requireAdmin.mockResolvedValueOnce({ id: "admin-1", role: "ADMIN" });
    disable.mockRejectedValueOnce(new AdminTotpRecoveryTargetNotFoundError("not found"));
    const response = await POST(request(), { params: Promise.resolve({ id: "u-1" }) });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/accounts/u-1?editor=failed");
  });

  it("returns 401 for unauthenticated callers", async () => {
    requireAdmin.mockRejectedValueOnce(new Error("unauthenticated"));
    const response = await POST(request(), { params: Promise.resolve({ id: "u-1" }) });
    expect(response.status).toBe(401);
  });
});

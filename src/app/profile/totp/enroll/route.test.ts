import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireOwner = vi.hoisted(() => vi.fn());
beforeEach(() => vi.resetAllMocks());
const enroll = vi.hoisted(() => vi.fn());
vi.mock("@/app/owner-guard", () => ({ requireOwnerFromCookie: requireOwner, ownerProtectedMutationResponse: (error: unknown) => (error instanceof Error && error.message === "unauthenticated") ? new Response(null, { status: 401 }) : null }));
vi.mock("@/auth/totp-store", () => ({ getTotpService: () => ({ enroll }) }));

import { POST } from "./route";

const sameOrigin = { origin: "http://local", host: "local" };
const request = () => new Request("http://local/profile/totp/enroll", { method: "POST", headers: sameOrigin });

describe("profile TOTP enroll route", () => {
  it("rejects cross-origin posts", async () => {
    const response = await POST(new Request("http://local/profile/totp/enroll", { method: "POST", headers: { host: "local" } }));
    expect(response.status).toBe(403);
  });

  it("returns provisioning data on success", async () => {
    requireOwner.mockResolvedValueOnce({ id: "user-1", username: "owner" });
    enroll.mockResolvedValueOnce({ provisioningUri: "otpauth://totp/test", recoveryCodes: ["a", "b"] });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.provisioningUri).toBe("otpauth://totp/test");
    expect(body.recoveryCodes).toEqual(["a", "b"]);
  });

  it("returns 401 for unauthenticated owners", async () => {
    requireOwner.mockRejectedValueOnce(new Error("unauthenticated"));
    const response = await POST(request());
    expect(response.status).toBe(401);
  });

  it("returns opaque unavailable on service error", async () => {
    requireOwner.mockResolvedValueOnce({ id: "user-1", username: "owner" });
    enroll.mockRejectedValueOnce(new Error("conflict"));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "unavailable" });
  });
});

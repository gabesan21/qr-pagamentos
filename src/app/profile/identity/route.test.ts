import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { requireOwner, protectedResponse, updateIdentity, Conflict } = vi.hoisted(() => {
  class Conflict extends Error {}
  return {
    requireOwner: vi.fn(),
    protectedResponse: vi.fn(),
    updateIdentity: vi.fn(),
    Conflict,
  };
});
vi.mock("@/app/owner-guard", () => ({
  requireOwnerFromCookie: requireOwner,
  ownerProtectedMutationResponse: protectedResponse,
}));
vi.mock("@/auth/profile", () => ({
  getProfileService: () => ({ updateIdentity }),
  ProfileConflictError: Conflict,
}));

import { POST } from "./route";

const actor = { id: "owner", username: "owner", email: null, role: "USER", status: "ACTIVE", createdAt: new Date() };
const headers = { origin: "http://local", host: "local" };
function request(values: Record<string, string>, requestHeaders: Record<string, string> = headers) {
  return new Request("http://local/profile/identity", { method: "POST", headers: requestHeaders, body: new URLSearchParams(values) });
}

describe("profile identity route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects origin before authorization and authorization before parsing", async () => {
    const crossOrigin = await POST(request({}, { host: "local" }));
    expect(crossOrigin.status).toBe(403);
    expect(requireOwner).not.toHaveBeenCalled();

    requireOwner.mockRejectedValue(new Error("protected"));
    protectedResponse.mockReturnValue(new Response(null, { status: 401 }));
    const denied = request({ username: "forged" });
    const parse = vi.spyOn(denied, "formData");
    expect((await POST(denied)).status).toBe(401);
    expect(parse).not.toHaveBeenCalled();
    expect(updateIdentity).not.toHaveBeenCalled();
  });

  it("passes only own identity fields and returns the finite redirects", async () => {
    requireOwner.mockResolvedValue(actor);
    protectedResponse.mockReturnValue(null);
    const changed = await POST(request({ username: "new.owner", email: "", expectedVersion: "2", ownerId: "forged" }));
    expect(updateIdentity).toHaveBeenCalledWith(actor, { username: "new.owner", email: "", expectedVersion: "2" });
    expect(changed.headers.get("location")).toBe("/profile?identity=changed");

    updateIdentity.mockRejectedValueOnce(new Conflict());
    expect((await POST(request({}))).headers.get("location")).toBe("/profile?identity=conflict");
    updateIdentity.mockRejectedValueOnce(new Error("detail"));
    const failed = await POST(request({}));
    expect(failed.headers.get("location")).toBe("/profile?identity=failed");
    expect(`${await failed.text()}${failed.headers.get("location")}`).not.toMatch(/detail|forged|new\.owner/);
  });
});

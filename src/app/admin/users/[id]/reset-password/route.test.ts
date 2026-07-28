import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireAdminFromCookie, protectedMutationResponse, sendResetEmail } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  protectedMutationResponse: vi.fn(),
  sendResetEmail: vi.fn(),
}));

vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/admin-password-reset", () => ({ AdminPasswordResetUnavailableError: Error, getAdminPasswordResetService: () => ({ sendResetEmail }) }));

import { AdminPasswordResetUnavailableError } from "@/auth/admin-password-reset";
import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const target = { params: Promise.resolve({ id: "target" }) };
const request = (headers: Record<string, string> = { origin: "http://0.0.0.0:3000", host: "0.0.0.0:3000" }) =>
  new Request("http://0.0.0.0:3000/admin/users/target/reset-password", { method: "POST", headers });

describe("administrator password reset request route contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects cross-origin and missing-Origin posts before any auth or service work", async () => {
    for (const headers of [{ host: "0.0.0.0:3000" }, { origin: "https://evil.example", host: "0.0.0.0:3000" }] as Record<string, string>[]) {
      const response = await POST(request(headers), target);
      expect(response.status).toBe(403);
      expect(await response.text()).toBe("");
      expect(response.headers.get("location")).toBeNull();
    }
    expect(requireAdminFromCookie).not.toHaveBeenCalled();
    expect(sendResetEmail).not.toHaveBeenCalled();
  });

  it("returns empty 401 and 403 without disclosure", async () => {
    for (const [statusCode, error] of [[401, "unauthenticated"], [403, "forbidden"]] as const) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error(error));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status: statusCode }));

      const response = await POST(request(), target);

      expect(response.status).toBe(statusCode);
      expect(await response.text()).toBe("");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("www-authenticate")).toBeNull();
      expect(sendResetEmail).not.toHaveBeenCalled();
    }
  });

  it("sends the reset email through the re-authorized principal and redirects opaquely", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    sendResetEmail.mockResolvedValue(undefined);

    const response = await POST(request(), target);

    expect(sendResetEmail).toHaveBeenCalledWith("target", actor);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/accounts/target?reset=requested");
  });

  it("shares one opaque failure redirect for unavailable targets and send failures", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    sendResetEmail.mockRejectedValueOnce(new AdminPasswordResetUnavailableError("no email"));
    sendResetEmail.mockRejectedValueOnce(new Error("smtp down"));

    const unavailable = await POST(request(), target);
    expect(unavailable.status).toBe(303);
    expect(unavailable.headers.get("location")).toBe("/admin/accounts/target?reset=failed");

    const failed = await POST(request(), target);
    expect(failed.status).toBe(303);
    expect(failed.headers.get("location")).toBe("/admin/accounts/target?reset=failed");
  });
});

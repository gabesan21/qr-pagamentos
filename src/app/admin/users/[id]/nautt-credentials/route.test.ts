import { describe, expect, it, vi } from "vitest";

const { requireAdminFromCookie, protectedMutationResponse, onboard } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  protectedMutationResponse: vi.fn(),
  onboard: vi.fn(),
}));

vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("server-only", () => ({}));
vi.mock("@/integrations/nautt/owner-onboarding", () => ({ getOwnerOnboardingService: () => ({ onboard }) }));

import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const request = (body = new URLSearchParams()) => new Request("http://0.0.0.0:3000/admin/users/target/nautt-credentials", { method: "POST", body });
const target = { params: Promise.resolve({ id: "target" }) };

describe("admin nautt credentials route", () => {
  process.env.NAUTT_WEBHOOK_CALLBACK_URL = "https://payments.example/api/nautt/webhooks";
  it("returns empty 401 and 403 responses", async () => {
    for (const status of [401, 403] as const) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("protected"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));
      const response = await POST(request(), target);
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
      expect(response.headers.get("location")).toBeNull();
    }
  });

  it("uses the cookie principal and the URL target, then redirects opaquely", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    onboard.mockResolvedValue(undefined);
    const response = await POST(request(new URLSearchParams({ apiKey: "secret-key", userId: "attacker" })), target);
    expect(onboard).toHaveBeenCalledWith(actor, "target", "secret-key", "https://payments.example/api/nautt/webhooks");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?success=nautt-credentials");
    expect(response.headers.get("location")).not.toContain("secret-key");
    expect(response.headers.get("location")).not.toContain("target");
  });

  it("redirects failures without disclosing the target or key", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    onboard.mockRejectedValueOnce(new Error("save failed"));
    const response = await POST(request(new URLSearchParams({ apiKey: "secret-key" })), target);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?error=nautt-credentials-failed");
    expect(response.headers.get("location")).not.toContain("secret-key");
    expect(response.headers.get("location")).not.toContain("target");
  });
});

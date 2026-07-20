import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAuthenticated, onboard } = vi.hoisted(() => ({ requireAuthenticated: vi.fn(), onboard: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", async (original) => ({ ...(await original()), getAuthorizationService: () => ({ requireAuthenticated }) }));
vi.mock("@/integrations/nautt/owner-onboarding", async (original) => ({ ...(await original()), getOwnerOnboardingService: () => ({ onboard }) }));

import { UnauthenticatedError } from "@/auth/authorization";
import { POST } from "./route";

const principal = { id: "owner", username: "owner", email: null, role: "USER", status: "ACTIVE", createdAt: new Date() };

describe("owner Nautt credential route", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.NAUTT_WEBHOOK_CALLBACK_URL = "https://payments.example/api/nautt/webhooks"; });

  it("returns an empty 401", async () => {
    requireAuthenticated.mockRejectedValue(new UnauthenticatedError());
    const response = await POST(new Request("http://local/nautt-credentials", { method: "POST", body: new FormData() }));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("derives owner and callback on the server and never reflects forged fields", async () => {
    requireAuthenticated.mockResolvedValue(principal);
    const form = new FormData();
    form.set("apiKey", "private-key"); form.set("ownerId", "forged-owner"); form.set("callbackUrl", "https://evil.example"); form.set("locale", "es"); form.set("credentialRevision", "forged");
    const response = await POST(new Request("http://local/nautt-credentials", { method: "POST", body: form }));
    expect(onboard).toHaveBeenCalledWith(principal, principal.id, "private-key", "https://payments.example/api/nautt/webhooks");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?nautt=configured");
    expect(`${await response.text()}${response.headers.get("location")}`).not.toMatch(/private-key|forged-owner|evil|credentialRevision/);
  });
});

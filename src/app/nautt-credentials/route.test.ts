import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, onboard } = vi.hoisted(() => ({ requireUser: vi.fn(), onboard: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", async (original) => ({ ...(await original()), getAuthorizationService: () => ({ requireUser }) }));
vi.mock("@/integrations/nautt/owner-onboarding", async (original) => ({ ...(await original()), getOwnerOnboardingService: () => ({ onboard }) }));

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import { POST } from "./route";

const principal = { id: "owner", username: "owner", email: null, role: "USER", status: "ACTIVE", createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };

describe("owner Nautt credential route", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.NAUTT_WEBHOOK_CALLBACK_URL = "https://payments.example/api/nautt/webhooks"; });

  it("returns an empty 401", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError());
    const response = await POST(new Request("http://local/nautt-credentials", { method: "POST", headers: sameOrigin, body: new FormData() }));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("returns an empty 403 before form parsing or onboarding for an administrator", async () => {
    requireUser.mockRejectedValue(new ForbiddenError());
    const request = new Request("http://local/nautt-credentials", { method: "POST", headers: sameOrigin, body: new FormData() });
    const formData = vi.spyOn(request, "formData");

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(onboard).not.toHaveBeenCalled();
  });

  it("derives owner and callback on the server and never reflects forged fields", async () => {
    requireUser.mockResolvedValue(principal);
    const form = new FormData();
    form.set("apiKey", "private-key"); form.set("ownerId", "forged-owner"); form.set("callbackUrl", "https://evil.example"); form.set("locale", "es"); form.set("credentialRevision", "forged");
    const response = await POST(new Request("http://local/nautt-credentials", { method: "POST", headers: sameOrigin, body: form }));
    expect(onboard).toHaveBeenCalledWith(principal, principal.id, "private-key", "https://payments.example/api/nautt/webhooks");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?nautt=configured");
    expect(`${await response.text()}${response.headers.get("location")}`).not.toMatch(/private-key|forged-owner|evil|credentialRevision/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { replaceActiveKey, requireUser } = vi.hoisted(() => ({ replaceActiveKey: vi.fn(), requireUser: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", async (original) => ({ ...(await original()), getAuthorizationService: () => ({ requireUser }) }));
vi.mock("@/integrations/nautt/owner-onboarding", async (original) => ({ ...(await original()), getOwnerOnboardingService: () => ({ replaceActiveKey }) }));

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import { OwnerOnboardingChangedError, OwnerOnboardingInvalidKeyError } from "@/integrations/nautt/owner-onboarding";
import { POST } from "./route";

const principal = { id: "owner", username: "owner", email: null, role: "USER", status: "ACTIVE", createdAt: new Date() };
function request(apiKey = "candidate-key", headers: Record<string, string> = { origin: "http://local", host: "local" }) {
  const form = new FormData();
  form.set("apiKey", apiKey);
  return new Request("http://local/nautt-credentials/replace", { method: "POST", headers, body: form });
}

describe("owner Nautt credential replacement route", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.NAUTT_WEBHOOK_CALLBACK_URL = "https://payments.example/api/nautt/webhooks"; });

  it("derives the active owner and callback server-side before replacement", async () => {
    requireUser.mockResolvedValue(principal);
    const response = await POST(request());
    expect(replaceActiveKey).toHaveBeenCalledWith(principal, "candidate-key", "https://payments.example/api/nautt/webhooks");
    expect(response.headers.get("location")).toBe("/settings?nautt=replaced#settings-connection");
  });

  it("rejects a cross-origin request before authorization, form parsing, or replacement", async () => {
    const deniedRequest = request("candidate-key", { origin: "https://evil.example", host: "local" });
    const formData = vi.spyOn(deniedRequest, "formData");

    const response = await POST(deniedRequest);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(formData).not.toHaveBeenCalled();
    expect(requireUser).not.toHaveBeenCalled();
    expect(replaceActiveKey).not.toHaveBeenCalled();
  });

  it.each([
    [new UnauthenticatedError(), 401, null],
    [new ForbiddenError(), 403, null],
    [new OwnerOnboardingInvalidKeyError(), 303, "/settings?nautt=invalid#settings-connection"],
    [new OwnerOnboardingChangedError(), 303, "/settings?nautt=changed#settings-connection"],
  ])("keeps authorization and failure results opaque", async (error, status, location) => {
    requireUser.mockRejectedValue(error);
    if (status === 303) {
      requireUser.mockResolvedValue(principal);
      replaceActiveKey.mockRejectedValue(error);
    }
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(response.headers.get("location")).toBe(location);
    if (status !== 303) expect(replaceActiveKey).not.toHaveBeenCalled();
  });
});

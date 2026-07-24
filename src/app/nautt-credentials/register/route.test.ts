import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, completeRegistration } = vi.hoisted(() => ({ requireUser: vi.fn(), completeRegistration: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", async (original) => ({ ...(await original()), getAuthorizationService: () => ({ requireUser }) }));
vi.mock("@/integrations/nautt/owner-onboarding", async (original) => ({ ...(await original()), getOwnerOnboardingService: () => ({ completeRegistration }) }));

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import { POST } from "./route";

const sameOriginRequest = () => new Request("http://local/nautt-credentials/register", { method: "POST", headers: { origin: "http://local", host: "local" } });

describe("owner webhook completion route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses only authenticated server state", async () => {
    process.env.NAUTT_WEBHOOK_CALLBACK_URL = "https://payments.example/api/nautt/webhooks";
    const principal = { id: "owner" };
    requireUser.mockResolvedValue(principal);
    const response = await POST(sameOriginRequest());
    expect(completeRegistration).toHaveBeenCalledWith(principal, "https://payments.example/api/nautt/webhooks");
    expect(response.headers.get("location")).toBe("/?nautt=configured");
  });

  it("returns an empty 401", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError());
    const response = await POST(sameOriginRequest());
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("returns an empty 403 before registration work", async () => {
    requireUser.mockRejectedValue(new ForbiddenError());

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(completeRegistration).not.toHaveBeenCalled();
  });
});

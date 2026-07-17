import { describe, expect, it, vi } from "vitest";

const { requireAuthenticated, completeRegistration } = vi.hoisted(() => ({ requireAuthenticated: vi.fn(), completeRegistration: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", async (original) => ({ ...(await original()), getAuthorizationService: () => ({ requireAuthenticated }) }));
vi.mock("@/integrations/nautt/owner-onboarding", async (original) => ({ ...(await original()), getOwnerOnboardingService: () => ({ completeRegistration }) }));

import { UnauthenticatedError } from "@/auth/authorization";
import { POST } from "./route";

describe("owner webhook completion route", () => {
  it("uses only authenticated server state", async () => {
    process.env.NAUTT_WEBHOOK_CALLBACK_URL = "https://payments.example/api/nautt/webhooks";
    const principal = { id: "owner" };
    requireAuthenticated.mockResolvedValue(principal);
    const response = await POST();
    expect(completeRegistration).toHaveBeenCalledWith(principal, "https://payments.example/api/nautt/webhooks");
    expect(response.headers.get("location")).toBe("/?nautt=configured");
  });

  it("returns an empty 401", async () => {
    requireAuthenticated.mockRejectedValue(new UnauthenticatedError());
    const response = await POST();
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });
});

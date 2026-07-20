import { describe, expect, it, vi } from "vitest";

const { requireAuthenticated, resetRegistration } = vi.hoisted(() => ({ requireAuthenticated: vi.fn(), resetRegistration: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", async (original) => ({ ...(await original()), getAuthorizationService: () => ({ requireAuthenticated }) }));
vi.mock("@/integrations/nautt/owner-onboarding", async (original) => ({ ...(await original()), getOwnerOnboardingService: () => ({ resetRegistration }) }));

import { UnauthenticatedError } from "@/auth/authorization";
import { OwnerOnboardingChangedError } from "@/integrations/nautt/owner-onboarding";
import { POST } from "./route";

describe("owner webhook registration reset route", () => {
  it("returns an empty 401", async () => {
    requireAuthenticated.mockRejectedValue(new UnauthenticatedError());
    const response = await POST();
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("resets only the authenticated principal and redirects opaquely", async () => {
    const principal = { id: "owner" };
    requireAuthenticated.mockResolvedValue(principal);
    const response = await POST();
    expect(resetRegistration).toHaveBeenCalledWith(principal);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?nautt=reset");
  });

  it("maps a refused reset to the opaque changed outcome", async () => {
    requireAuthenticated.mockResolvedValue({ id: "owner" });
    resetRegistration.mockRejectedValue(new OwnerOnboardingChangedError());
    const response = await POST();
    expect(response.headers.get("location")).toBe("/?nautt=changed");
  });

  it("maps any other failure to the opaque unavailable outcome", async () => {
    requireAuthenticated.mockResolvedValue({ id: "owner" });
    resetRegistration.mockRejectedValue(new Error("reset outcome unknown"));
    const response = await POST();
    expect(response.headers.get("location")).toBe("/?nautt=unavailable");
  });
});

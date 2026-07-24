import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, resetRegistration } = vi.hoisted(() => ({ requireUser: vi.fn(), resetRegistration: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/authorization", async (original) => ({ ...(await original()), getAuthorizationService: () => ({ requireUser }) }));
vi.mock("@/integrations/nautt/owner-onboarding", async (original) => ({ ...(await original()), getOwnerOnboardingService: () => ({ resetRegistration }) }));

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import { OwnerOnboardingChangedError } from "@/integrations/nautt/owner-onboarding";
import { POST } from "./route";

const sameOriginRequest = () => new Request("http://local/nautt-credentials/reset", { method: "POST", headers: { origin: "http://local", host: "local" } });

describe("owner webhook registration reset route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty 401", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError());
    const response = await POST(sameOriginRequest());
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("returns an empty 403 before reset work", async () => {
    requireUser.mockRejectedValue(new ForbiddenError());

    const response = await POST(sameOriginRequest());

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(resetRegistration).not.toHaveBeenCalled();
  });

  it("resets only the authenticated principal and redirects opaquely", async () => {
    const principal = { id: "owner" };
    requireUser.mockResolvedValue(principal);
    const response = await POST(sameOriginRequest());
    expect(resetRegistration).toHaveBeenCalledWith(principal);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?nautt=reset");
  });

  it("maps a refused reset to the opaque changed outcome", async () => {
    requireUser.mockResolvedValue({ id: "owner" });
    resetRegistration.mockRejectedValue(new OwnerOnboardingChangedError());
    const response = await POST(sameOriginRequest());
    expect(response.headers.get("location")).toBe("/?nautt=changed");
  });

  it("maps any other failure to the opaque unavailable outcome", async () => {
    requireUser.mockResolvedValue({ id: "owner" });
    resetRegistration.mockRejectedValue(new Error("reset outcome unknown"));
    const response = await POST(sameOriginRequest());
    expect(response.headers.get("location")).toBe("/?nautt=unavailable");
  });
});

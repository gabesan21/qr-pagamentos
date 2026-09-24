import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, probeCurrencyPair } = vi.hoisted(() => ({ requireUser: vi.fn(), probeCurrencyPair: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "session" }) }) }));
vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({ getDatabaseClient: vi.fn() }));
vi.mock("@/auth/authorization", async (original) => ({ ...(await original()), getAuthorizationService: () => ({ requireUser }) }));
vi.mock("@/auth/currency-pair-verification", async (original) => ({ ...(await original()), probeCurrencyPair }));

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import {
  CurrencyPairProbeCodeInvalidError,
  CurrencyPairProbeThrottledError,
} from "@/auth/currency-pair-verification";
import { POST } from "./route";

const principal = { id: "owner", username: "owner", email: null, role: "USER", status: "ACTIVE", createdAt: new Date() };
const sameOrigin = { origin: "http://local", host: "local" };

describe("currency-pair probe route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an empty 401", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError());
    const response = await POST(new Request("http://local/currency-pair-probe", { method: "POST", headers: sameOrigin, body: new FormData() }));
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
  });

  it("returns an empty 403 before form parsing for an administrator", async () => {
    requireUser.mockRejectedValue(new ForbiddenError());
    const request = new Request("http://local/currency-pair-probe", { method: "POST", headers: sameOrigin, body: new FormData() });
    const formData = vi.spyOn(request, "formData");

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
    expect(probeCurrencyPair).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin request before authentication", async () => {
    const response = await POST(new Request("http://local/currency-pair-probe", {
      method: "POST",
      headers: { origin: "http://evil", host: "local" },
      body: new FormData(),
    }));
    expect(response.status).toBe(403);
    expect(requireUser).not.toHaveBeenCalled();
  });

  it("probes with the caller's own principal and redirects to the ok notice", async () => {
    requireUser.mockResolvedValue(principal);
    probeCurrencyPair.mockResolvedValue({ outcome: "ok" });
    const form = new FormData();
    form.set("code", "BRL");
    const response = await POST(new Request("http://local/currency-pair-probe", { method: "POST", headers: sameOrigin, body: form }));
    expect(probeCurrencyPair).toHaveBeenCalledWith(principal, "BRL");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/settings?currency-probe=ok#settings-currency");
  });

  it("redirects to the refused notice for a non-ok outcome, without leaking the code", async () => {
    requireUser.mockResolvedValue(principal);
    probeCurrencyPair.mockResolvedValue({ outcome: "validation.failed" });
    const response = await POST(new Request("http://local/currency-pair-probe", { method: "POST", headers: sameOrigin, body: new FormData() }));
    expect(response.headers.get("location")).toBe("/settings?currency-probe=refused#settings-currency");
    expect(`${await response.text()}${response.headers.get("location")}`).not.toMatch(/validation\.failed/);
  });

  it.each([
    [new CurrencyPairProbeThrottledError(), "/settings?currency-probe=throttled#settings-currency"],
    [new CurrencyPairProbeCodeInvalidError(), "/settings?currency-probe=invalid#settings-currency"],
    [new Error("provider detail"), "/settings?currency-probe=failed#settings-currency"],
  ])("maps probe failures to the opaque settings notice %s", async (error, location) => {
    requireUser.mockResolvedValue(principal);
    probeCurrencyPair.mockRejectedValue(error);

    const response = await POST(new Request("http://local/currency-pair-probe", { method: "POST", headers: sameOrigin, body: new FormData() }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(location);
    expect(await response.text()).toBe("");
  });
});

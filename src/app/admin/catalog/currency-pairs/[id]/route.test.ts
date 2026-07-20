import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const { requireAdminFromCookie, protectedMutationResponse, updateCurrencyPair, setCurrencyPairActive } = vi.hoisted(() => ({ requireAdminFromCookie: vi.fn(), protectedMutationResponse: vi.fn(), updateCurrencyPair: vi.fn(), setCurrencyPairActive: vi.fn() }));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/nautt-catalog", () => ({ getNauttCatalogService: () => ({ updateCurrencyPair, setCurrencyPairActive }) }));

import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const pairId = randomUUID();
const request = (body = new URLSearchParams()) => new Request(`http://0.0.0.0:3000/admin/catalog/currency-pairs/${pairId}`, { method: "POST", body });
const params = Promise.resolve({ id: pairId });

describe("catalog currency pair update route", () => {
  it("updates a label and toggles active state", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    updateCurrencyPair.mockResolvedValue(undefined);
    setCurrencyPairActive.mockResolvedValue(undefined);

    const updateResponse = await POST(request(new URLSearchParams({ label: "BRL / USDT" })), { params });
    expect(updateCurrencyPair).toHaveBeenCalledWith(actor, pairId, "BRL / USDT");
    expect(updateResponse.headers.get("location")).toBe("/admin?success=catalog-changed");

    const toggleResponse = await POST(request(new URLSearchParams({ intent: "toggle-inactive" })), { params });
    expect(setCurrencyPairActive).toHaveBeenCalledWith(actor, pairId, false);
    expect(toggleResponse.headers.get("location")).toBe("/admin?success=catalog-changed");
  });

  it("returns empty protected outcomes", async () => {
    for (const status of [401, 403]) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("protected"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));
      const response = await POST(request(), { params });
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    }
  });

  it("redirects failures opaquely", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    updateCurrencyPair.mockRejectedValue(new Error("not found"));
    const response = await POST(request(new URLSearchParams({ label: "BRL / USDT" })), { params });
    expect(response.headers.get("location")).toBe("/admin?error=catalog-change-failed");
  });
});

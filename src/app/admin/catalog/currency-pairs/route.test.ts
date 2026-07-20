import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const { requireAdminFromCookie, protectedMutationResponse, createCurrencyPair } = vi.hoisted(() => ({ requireAdminFromCookie: vi.fn(), protectedMutationResponse: vi.fn(), createCurrencyPair: vi.fn() }));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/nautt-catalog", () => ({ getNauttCatalogService: () => ({ createCurrencyPair }) }));

import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const request = (body = new URLSearchParams()) => new Request("http://0.0.0.0:3000/admin/catalog/currency-pairs", { method: "POST", body });

describe("catalog currency pairs create route", () => {
  it("returns empty protected outcomes", async () => {
    for (const status of [401, 403]) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("protected"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));
      const response = await POST(request());
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    }
  });

  it("creates a currency pair and redirects opaquely", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    createCurrencyPair.mockResolvedValue(undefined);
    const currencyUuid = randomUUID();
    const exchangeCurrencyUuid = randomUUID();
    const response = await POST(request(new URLSearchParams({ label: "BRL/USDT", currencyUuid, exchangeCurrencyUuid })));
    expect(createCurrencyPair).toHaveBeenCalledWith(actor, { label: "BRL/USDT", currencyUuid, exchangeCurrencyUuid });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?success=catalog-created");
  });

  it("redirects validation failures without value disclosure", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    createCurrencyPair.mockRejectedValue(new Error("validation"));
    const response = await POST(request(new URLSearchParams({ label: "BRL/USDT", currencyUuid: "not-a-uuid", exchangeCurrencyUuid: randomUUID() })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?error=catalog-create-failed");
  });
});

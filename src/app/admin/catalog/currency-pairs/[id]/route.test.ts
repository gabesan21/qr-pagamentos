import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { TestNauttCatalogStore } from "@/auth/nautt-catalog-test-store";

const { requireAdminFromCookie, protectedMutationResponse } = vi.hoisted(() => ({ requireAdminFromCookie: vi.fn(), protectedMutationResponse: vi.fn() }));
const storeRef = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock(import("@/auth/nautt-catalog"), async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/nautt-catalog")>();
  const { createTestNauttCatalogStore } = await import("@/auth/nautt-catalog-test-store");
  storeRef.current = createTestNauttCatalogStore();
  return {
    ...actual,
    getNauttCatalogService: () => actual.createNauttCatalogService(storeRef.current as TestNauttCatalogStore),
  };
});

import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const request = (body = new URLSearchParams(), id = "unused") => new Request(`http://0.0.0.0:3000/admin/catalog/currency-pairs/${id}`, { method: "POST", body });
const testStore = () => storeRef.current as TestNauttCatalogStore;

describe("catalog currency pair update route", () => {
  it("updates a label and toggles active state", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);

    const validUuid = randomUUID();
    const pair = await testStore().createCurrencyPair({ label: "BRL/USDT", currencyUuid: validUuid, exchangeCurrencyUuid: validUuid });

    const updateResponse = await POST(request(new URLSearchParams({ label: "BRL / USDT" }), pair.id), { params: Promise.resolve({ id: pair.id }) });
    expect(updateResponse.headers.get("location")).toBe("/admin?success=catalog-changed");

    const toggleResponse = await POST(request(new URLSearchParams({ intent: "toggle-inactive" }), pair.id), { params: Promise.resolve({ id: pair.id }) });
    expect(toggleResponse.headers.get("location")).toBe("/admin?success=catalog-changed");
  });

  it("returns empty protected outcomes", async () => {
    for (const status of [401, 403]) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("protected"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));
      const response = await POST(request(), { params: Promise.resolve({ id: randomUUID() }) });
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    }
  });

  it("redirects invalid id and validation failures opaquely", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);

    const invalidId = await POST(request(new URLSearchParams({ label: "BRL / USDT" }), "not-a-uuid"), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(invalidId.headers.get("location")).toBe("/admin?error=catalog-change-failed");

    const validUuid = randomUUID();
    const pair = await testStore().createCurrencyPair({ label: "BRL/USDT", currencyUuid: validUuid, exchangeCurrencyUuid: validUuid });

    const emptyLabel = await POST(request(new URLSearchParams({ label: "" }), pair.id), { params: Promise.resolve({ id: pair.id }) });
    expect(emptyLabel.headers.get("location")).toBe("/admin?error=catalog-change-failed");

    const notFound = await POST(request(new URLSearchParams({ label: "BRL / USDT" }), pair.id), { params: Promise.resolve({ id: randomUUID() }) });
    expect(notFound.headers.get("location")).toBe("/admin?error=catalog-change-failed");
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { TestNauttCatalogStore } from "@/auth/nautt-catalog-test-store";

vi.mock("server-only", () => ({}));

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
const request = (body = new URLSearchParams()) => new Request("http://0.0.0.0:3000/admin/catalog/payment-methods", { method: "POST", headers: { origin: "http://0.0.0.0:3000", host: "0.0.0.0:3000" }, body });
const configureCurrency = async () => {
  const store = storeRef.current as TestNauttCatalogStore;
  const pair = await store.createCurrencyPair({ label: "default", currencyUuid: randomUUID(), exchangeCurrencyUuid: randomUUID() });
  store.currencyPointers.set("BRL", pair.id);
};

describe("catalog payment methods create route", () => {
  it("returns empty protected outcomes", async () => {
    for (const status of [401, 403]) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("protected"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));
      const response = await POST(request());
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    }
  });

  it("creates a payment method with a valid UUID and redirects opaquely", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    await configureCurrency();
    const response = await POST(request(new URLSearchParams({ label: "PIX", currencyCode: "BRL", exchangeCurrencyUuid: randomUUID() })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/settings?success=method-created");
  });

  it("normalizes uppercase UUIDs to lowercase before persistence", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    await configureCurrency();
    const response = await POST(request(new URLSearchParams({ label: "PIX", currencyCode: "BRL", exchangeCurrencyUuid: randomUUID().toUpperCase() })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/settings?success=method-created");
  });

  it("redirects validation failures without value disclosure", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);

    const malformed = await POST(request(new URLSearchParams({ label: "PIX", currencyCode: "BRL", exchangeCurrencyUuid: "not-a-uuid" })));
    expect(malformed.status).toBe(303);
    expect(malformed.headers.get("location")).toBe("/admin/settings?error=method-failed");

    const empty = await POST(request(new URLSearchParams({ label: "PIX", currencyCode: "BRL", exchangeCurrencyUuid: "" })));
    expect(empty.headers.get("location")).toBe("/admin/settings?error=method-failed");

    const missing = await POST(request(new URLSearchParams({ label: "PIX" })));
    expect(missing.headers.get("location")).toBe("/admin/settings?error=method-failed");
  });
});

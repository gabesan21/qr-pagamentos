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
const request = (body = new URLSearchParams(), id = "unused") => new Request(`http://0.0.0.0:3000/admin/catalog/payment-methods/${id}`, { method: "POST", headers: { origin: "http://0.0.0.0:3000", host: "0.0.0.0:3000" }, body });
const testStore = () => storeRef.current as TestNauttCatalogStore;

describe("catalog payment method update route", () => {
  it("updates a label and toggles active state", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);

    const validUuid = randomUUID();
    const method = await testStore().createPaymentMethod({ label: "PIX", paymentMethodUuid: validUuid });

    const updateResponse = await POST(request(new URLSearchParams({ label: "PIX Copy-and-Paste" }), method.id), { params: Promise.resolve({ id: method.id }) });
    expect(updateResponse.headers.get("location")).toBe("/admin?success=catalog-changed");

    const toggleResponse = await POST(request(new URLSearchParams({ intent: "toggle-inactive" }), method.id), { params: Promise.resolve({ id: method.id }) });
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

    const invalidId = await POST(request(new URLSearchParams({ label: "PIX Copy-and-Paste" }), "not-a-uuid"), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(invalidId.headers.get("location")).toBe("/admin?error=catalog-change-failed");

    const validUuid = randomUUID();
    const method = await testStore().createPaymentMethod({ label: "PIX", paymentMethodUuid: validUuid });

    const emptyLabel = await POST(request(new URLSearchParams({ label: "" }), method.id), { params: Promise.resolve({ id: method.id }) });
    expect(emptyLabel.headers.get("location")).toBe("/admin?error=catalog-change-failed");

    const notFound = await POST(request(new URLSearchParams({ label: "PIX Copy-and-Paste" }), method.id), { params: Promise.resolve({ id: randomUUID() }) });
    expect(notFound.headers.get("location")).toBe("/admin?error=catalog-change-failed");
  });
});

import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const { requireAdminFromCookie, protectedMutationResponse } = vi.hoisted(() => ({ requireAdminFromCookie: vi.fn(), protectedMutationResponse: vi.fn() }));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock(import("@/auth/nautt-catalog"), async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/auth/nautt-catalog")>();
  const { createTestNauttCatalogStore } = await import("@/auth/nautt-catalog-test-store");
  return {
    ...actual,
    getNauttCatalogService: () => actual.createNauttCatalogService(createTestNauttCatalogStore()),
  };
});

import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const request = (body = new URLSearchParams()) => new Request("http://0.0.0.0:3000/admin/catalog/payment-methods", { method: "POST", body });

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
    const paymentMethodUuid = randomUUID();
    const response = await POST(request(new URLSearchParams({ label: "PIX", paymentMethodUuid })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?success=catalog-created");
  });

  it("normalizes uppercase UUIDs to lowercase before persistence", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    const paymentMethodUuid = randomUUID().toUpperCase();
    const response = await POST(request(new URLSearchParams({ label: "PIX", paymentMethodUuid })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?success=catalog-created");
  });

  it("redirects validation failures without value disclosure", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);

    const malformed = await POST(request(new URLSearchParams({ label: "PIX", paymentMethodUuid: "not-a-uuid" })));
    expect(malformed.status).toBe(303);
    expect(malformed.headers.get("location")).toBe("/admin?error=catalog-create-failed");

    const empty = await POST(request(new URLSearchParams({ label: "PIX", paymentMethodUuid: "" })));
    expect(empty.headers.get("location")).toBe("/admin?error=catalog-create-failed");

    const missing = await POST(request(new URLSearchParams({ label: "PIX" })));
    expect(missing.headers.get("location")).toBe("/admin?error=catalog-create-failed");
  });
});

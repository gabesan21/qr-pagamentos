import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireAdminFromCookie, protectedMutationResponse, save } = vi.hoisted(() => ({ requireAdminFromCookie: vi.fn(), protectedMutationResponse: vi.fn(), save: vi.fn() }));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/payment-settings", () => ({ getPaymentSettingsService: () => ({ save }), SUPPORTED_CURRENCIES: ["BRL"], SUPPORTED_PAYMENT_METHODS: ["PIX"] }));

import { POST } from "./route";

const actor = { id: "admin", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const request = (body = new URLSearchParams()) => new Request("http://0.0.0.0:3000/admin/payment-settings", { method: "POST", headers: { origin: "http://0.0.0.0:3000", host: "0.0.0.0:3000" }, body });

describe("payment settings route", () => {
  it("returns empty protected outcomes", async () => {
    for (const status of [401, 403]) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("protected"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));
      const response = await POST(request());
      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
    }
  });

  it("uses the cookie principal and redirects opaquely", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    save.mockResolvedValue(undefined);
    const response = await POST(request(new URLSearchParams({ currencies: "BRL", paymentMethods: "PIX", actorId: "attacker" })));
    expect(save).toHaveBeenCalledWith(actor, { currencies: ["BRL"], paymentMethods: ["PIX"] });
    expect(response.headers.get("location")).toBe("/admin?success=settings");
  });

  it("redirects invalid and unknown input without value disclosure", async () => {
    requireAdminFromCookie.mockResolvedValue(actor);
    protectedMutationResponse.mockReturnValue(null);
    const response = await POST(request(new URLSearchParams({ currencies: "USD" })));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?error=settings-failed");
  });
});

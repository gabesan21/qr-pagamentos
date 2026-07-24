import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { requireAdminFromCookie, protectedMutationResponse, register, replace, deactivate } = vi.hoisted(() => ({
  requireAdminFromCookie: vi.fn(),
  protectedMutationResponse: vi.fn(),
  register: vi.fn(),
  replace: vi.fn(),
  deactivate: vi.fn(),
}));
vi.mock("@/app/admin/guard", () => ({ requireAdminFromCookie, protectedMutationResponse }));
vi.mock("@/auth/supported-exchange-currency", () => ({
  getSupportedExchangeCurrencyService: () => ({ register, replace, deactivate }),
}));

import { POST } from "./route";

const actor = { id: "admin-id", username: "admin", email: null, role: "ADMIN", status: "ACTIVE", createdAt: new Date() };

function submit(body: Record<string, string>, headers: Record<string, string> = {}) {
  return new Request("https://app.example.com/admin/exchange-currencies", {
    method: "POST",
    headers: { origin: "https://app.example.com", host: "app.example.com", ...headers },
    body: new URLSearchParams(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminFromCookie.mockResolvedValue(actor);
  protectedMutationResponse.mockReturnValue(null);
});

describe("admin exchange-currency mutation route", () => {
  it("rejects cross-origin posts before any authentication or service work", async () => {
    const response = await POST(submit({ intent: "register" }, { origin: "https://evil.example.com" }));

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("");
    expect(requireAdminFromCookie).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("returns only the protected empty outcomes for unauthenticated and non-administrator callers", async () => {
    for (const status of [401, 403]) {
      requireAdminFromCookie.mockRejectedValueOnce(new Error("denied"));
      protectedMutationResponse.mockReturnValueOnce(new Response(null, { status }));

      const response = await POST(submit({ intent: "register" }));

      expect(response.status).toBe(status);
      expect(await response.text()).toBe("");
      expect(register).not.toHaveBeenCalled();
    }
  });

  it("dispatches register with only the documented mapping fields and an opaque success redirect", async () => {
    const response = await POST(submit({
      intent: "register",
      code: "BRL",
      label: "BRL/USDT",
      currencyUuid: "currency-uuid",
      exchangeCurrencyUuid: "exchange-uuid",
      actorId: "attacker",
    }));

    expect(register).toHaveBeenCalledWith(actor, {
      code: "BRL",
      label: "BRL/USDT",
      currencyUuid: "currency-uuid",
      exchangeCurrencyUuid: "exchange-uuid",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin?success=exchange-currency");
  });

  it("dispatches replace and deactivate intents", async () => {
    await POST(submit({ intent: "replace", code: "BRL", label: "BRL/USDT", currencyUuid: "a", exchangeCurrencyUuid: "b" }));
    expect(replace).toHaveBeenCalledWith(actor, { code: "BRL", label: "BRL/USDT", currencyUuid: "a", exchangeCurrencyUuid: "b" });

    await POST(submit({ intent: "deactivate", code: "BRL", label: "ignored" }));
    expect(deactivate).toHaveBeenCalledWith(actor, "BRL");
  });

  it("maps unknown intents, validation failures, and typed conflicts to the same opaque failure redirect", async () => {
    const unknown = await POST(submit({ intent: "drop-everything" }));
    expect(unknown.status).toBe(303);
    expect(unknown.headers.get("location")).toBe("/admin?error=exchange-currency-failed");
    expect(await unknown.text()).toBe("");

    register.mockRejectedValueOnce(new Error("Currency pair is already registered"));
    const conflict = await POST(submit({ intent: "register", code: "BRL", label: "BRL/USDT", currencyUuid: "leaked?", exchangeCurrencyUuid: "b" }));
    expect(conflict.status).toBe(303);
    expect(conflict.headers.get("location")).toBe("/admin?error=exchange-currency-failed");
    expect(await conflict.text()).toBe("");
  });
});

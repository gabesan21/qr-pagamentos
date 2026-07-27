import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Principal } from "@/auth/authorization";

import {
  createStorefrontCartCheckoutService,
  type StorefrontCartCheckoutRevalidation,
  type StorefrontCartCheckoutStore,
} from "./storefront-cart-checkout";

const slug = "minha-loja";
const coffee = "11111111-1111-4111-8111-111111111111";
const tea = "22222222-2222-4222-8222-222222222222";

const owner: Principal = {
  id: "770e8400-e29b-41d4-a716-446655440020",
  username: "cart.owner",
  email: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: new Date("2026-07-26T12:00:00.000Z"),
};
const currencyPairId = "330e8400-e29b-41d4-a716-446655440021";

const { revalidate, issueLink } = vi.hoisted(() => ({ revalidate: vi.fn(), issueLink: vi.fn() }));

const store: StorefrontCartCheckoutStore = { revalidate };
const service = createStorefrontCartCheckoutService(store, { issueLink });

function ready(overrides: Partial<Extract<StorefrontCartCheckoutRevalidation, { kind: "ready" }>> = {}): StorefrontCartCheckoutRevalidation {
  return { kind: "ready", owner, currencyPairId, ...overrides };
}

describe("storefront cart checkout service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revalidate.mockResolvedValue(ready());
    issueLink.mockResolvedValue({ identifier: "a".repeat(24) });
  });

  it("issues one SINGLE_USE PRODUCT_LINES link from server-derived facts only", async () => {
    const result = await service.checkout(slug, { items: [{ reference: coffee, quantity: 2 }, { reference: tea, quantity: 1 }] });

    expect(result).toEqual({ kind: "issued", paymentLinkIdentifier: "a".repeat(24) });
    expect(revalidate).toHaveBeenCalledWith(slug, [
      { reference: coffee, quantity: 2 },
      { reference: tea, quantity: 1 },
    ]);
    expect(issueLink).toHaveBeenCalledTimes(1);
    const [actor, input] = issueLink.mock.calls[0];
    expect(actor).toBe(owner);
    expect(input).toEqual({
      compositionKind: "PRODUCT_LINES",
      currencyPairId,
      linkType: "SINGLE_USE",
      expiresAt: null,
      lines: JSON.stringify([{ productId: coffee, quantity: 2 }, { productId: tea, quantity: 1 }]),
    });
  });

  it.each([
    ["a non-string slug", 42, { items: [{ reference: coffee, quantity: 1 }] }],
    ["an overlong slug", "a".repeat(64), { items: [{ reference: coffee, quantity: 1 }] }],
    ["a malformed slug", "Loja Inválida", { items: [{ reference: coffee, quantity: 1 }] }],
    ["a non-object body", slug, "items"],
    ["an array body", slug, [{ reference: coffee, quantity: 1 }]],
    ["a missing items member", slug, {}],
    ["an extra body key", slug, { items: [{ reference: coffee, quantity: 1 }], currency: "USD" }],
    ["an empty cart", slug, { items: [] }],
    ["a twenty-one-line cart", slug, { items: Array.from({ length: 21 }, (_, index) => ({ reference: `${String(index + 1).padStart(8, "0")}-0000-4000-8000-000000000000`, quantity: 1 })) }],
    ["a custom-amount member", slug, { items: [{ kind: "custom-amount", amount: "5" }] }],
    ["a tampered price key", slug, { items: [{ reference: coffee, quantity: 1, price: "0.01" }] }],
    ["a tampered currency key", slug, { items: [{ reference: coffee, quantity: 1, currencyCode: "USD" }] }],
    ["a non-UUID reference", slug, { items: [{ reference: "not-a-product", quantity: 1 }] }],
    ["a duplicate reference", slug, { items: [{ reference: coffee, quantity: 1 }, { reference: coffee.toUpperCase(), quantity: 2 }] }],
    ["a zero quantity", slug, { items: [{ reference: coffee, quantity: 0 }] }],
    ["an over-maximum quantity", slug, { items: [{ reference: coffee, quantity: 10_000 }] }],
    ["a fractional quantity", slug, { items: [{ reference: coffee, quantity: 1.5 }] }],
    ["a string quantity", slug, { items: [{ reference: coffee, quantity: "2" }] }],
  ])("rejects %s as the one opaque invalid without store work", async (_label, candidateSlug, body) => {
    await expect(service.checkout(candidateSlug, body)).resolves.toEqual({ kind: "invalid" });
    expect(revalidate).not.toHaveBeenCalled();
    expect(issueLink).not.toHaveBeenCalled();
  });

  it("maps the store's invalid revalidation to invalid without issuance", async () => {
    revalidate.mockResolvedValueOnce({ kind: "invalid" });
    await expect(service.checkout(slug, { items: [{ reference: coffee, quantity: 1 }] })).resolves.toEqual({ kind: "invalid" });
    expect(issueLink).not.toHaveBeenCalled();
  });

  it("maps the store's unavailable revalidation to unavailable without issuance", async () => {
    revalidate.mockResolvedValueOnce({ kind: "unavailable" });
    await expect(service.checkout(slug, { items: [{ reference: coffee, quantity: 1 }] })).resolves.toEqual({ kind: "unavailable" });
    expect(issueLink).not.toHaveBeenCalled();
  });

  it("propagates an issuance fault instead of mapping it to a body", async () => {
    const fault = new Error("Payment-link dependency is unavailable");
    issueLink.mockRejectedValueOnce(fault);
    await expect(service.checkout(slug, { items: [{ reference: coffee, quantity: 1 }] })).rejects.toBe(fault);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { get } = vi.hoisted(() => ({ get: vi.fn(() => "en-US,en;q=0.9") }));
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => ({ get }) }));
vi.mock("@/checkout/public-checkout-presentation", () => ({ getPublicCheckoutPresentationService: () => ({ read }) }));

import PublicCheckoutPage from "./page";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";

describe("public checkout page", () => {
  it("renders the exact projection with policy-driven fields and shared primitives", async () => {
    read.mockResolvedValueOnce({ product: { title: "Donation", description: "Support the project.", price: "12.50" }, checkoutPolicy: "NAME_EMAIL_CPF_ADDRESS" });
    const markup = renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) }));

    expect(read).toHaveBeenCalledWith(identifier, "en");
    expect(markup).toContain("Donation");
    expect(markup).toContain('for="checkout-name"');
    expect(markup).toContain('for="checkout-email"');
    expect(markup).toContain('for="checkout-cpf"');
    expect(markup).toContain('for="checkout-street"');
    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain('data-slot="field-set"');
    expect(markup).not.toContain("currencyUuid");
  });

  it("renders a generic unavailable state without a form", async () => {
    read.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(await PublicCheckoutPage({ params: Promise.resolve({ identifier }) }));

    expect(markup).toContain("This payment link is unavailable");
    expect(markup).not.toContain('data-slot="field-group"');
  });
});

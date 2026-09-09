import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";
import type { CheckoutDataPolicy } from "@/orders/payment-link-order";

import { paymentFromResponse, PublicCheckoutV2Form } from "./public-checkout-v2-form";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";

function markup(policy: CheckoutDataPolicy) {
  return renderToStaticMarkup(<PublicCheckoutV2Form dictionary={getDictionary("en")} identifier={identifier} policy={policy} />);
}

describe("public checkout V2 form", () => {
  it.each([
    ["NONE", []],
    ["EMAIL", ["email"]],
    ["NAME_EMAIL", ["name", "email"]],
    ["NAME_EMAIL_CPF", ["name", "email", "cpf"]],
    ["NAME_EMAIL_CPF_ADDRESS", ["name", "email", "cpf", "street", "number", "district", "city", "stateUf", "postalCode"]],
  ] as const)("renders exactly the %s policy fields", (policy, fields) => {
    const rendered = markup(policy);

    for (const field of ["name", "email", "cpf", "street", "number", "district", "city", "stateUf", "postalCode"]) {
      expect(rendered.includes(`checkout-${field}`), `${policy}.${field}`).toBe((fields as readonly string[]).includes(field));
    }
  });

  it("uses only the shared form, feedback, and action inventory with accessible states", () => {
    const rendered = markup("NAME_EMAIL_CPF_ADDRESS");

    for (const slot of ["card", "field-group", "field", "input", "button"]) expect(rendered).toContain(`data-slot="${slot}"`);
    expect(rendered).toContain('data-slot="field-set"');
    expect(rendered).toContain('type="submit"');
    expect(rendered).toContain('for="checkout-stateUf"');
    expect(markup("NONE")).toContain('role="status"');
  });

  // C03.c (14.6.1 round-1 repair 508e21d8): the V2 form was the other
  // component that used to emit the retired classes — pin by exact class
  // name, never by prefix.
  it("never emits a retired checkout-card/-form/-payment/-description class in the form phase", () => {
    const rendered = markup("NAME_EMAIL_CPF_ADDRESS");
    expect(rendered).not.toMatch(/\bcheckout-(card|form|payment|description)\b/);
  });

  it.each([
    ["RESERVED", { state: "RESERVED" }],
    ["CREATING", { state: "CREATING" }],
    ["PENDING", { state: "PENDING" }],
    ["INDETERMINATE", { state: "INDETERMINATE" }],
    ["CREATED", { state: "CREATED" }],
    ["CONFIRMED", { state: "CONFIRMED" }],
    ["REJECTED", { state: "REJECTED" }],
    ["CANCELLED", { state: "CANCELLED" }],
    ["EXPIRED", { state: "EXPIRED" }],
    ["REFUNDED", { state: "REFUNDED" }],
  ] as const)("accepts the pinned client state %s", (state, expected) => {
    expect(paymentFromResponse({ state })).toEqual(expected);
  });

  it("carries optional PIX fields only when they are strings", () => {
    expect(paymentFromResponse({ state: "PENDING", pixCopyPaste: "000201", pixQrCodeUrl: "https://qr.example.test/opaque" }))
      .toEqual({ state: "PENDING", pixCopyPaste: "000201", pixQrCodeUrl: "https://qr.example.test/opaque" });
    expect(paymentFromResponse({ state: "PENDING", pixCopyPaste: 42 })).toBeNull();
  });

  it.each([["SETTLED"], ["pending"], [""], [null], [undefined], [{}], ["PAID"]])("rejects the out-of-union state %s", (state) => {
    expect(paymentFromResponse(state && typeof state === "object" ? state : { state })).toBeNull();
  });
});

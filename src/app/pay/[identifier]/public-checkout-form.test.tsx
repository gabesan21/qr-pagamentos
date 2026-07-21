import { readFile } from "node:fs/promises";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";
import type { CheckoutDataPolicy } from "@/orders/payment-link-order";

import { PublicCheckoutForm } from "./public-checkout-form";

const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";

function markup(policy: CheckoutDataPolicy) {
  return renderToStaticMarkup(<PublicCheckoutForm dictionary={getDictionary("en")} identifier={identifier} policy={policy} />);
}

describe("public checkout form", () => {
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

  it("cancels hidden-tab polling and ignores a stale status response", async () => {
    const source = await readFile(new URL("./public-checkout-form.tsx", import.meta.url), "utf8");

    expect(source).toContain('if (document.visibilityState === "hidden") {');
    expect(source).toContain("controller?.abort();");
    expect(source).toContain("if (cancelled || document.visibilityState === \"hidden\" || pollId !== activePoll) return;");
  });
});

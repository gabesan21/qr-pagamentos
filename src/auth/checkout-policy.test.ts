import { describe, expect, it } from "vitest";

import { createCheckoutPolicyService, CheckoutPolicyValidationError, type CheckoutPolicyStore } from "./checkout-policy";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const otherOwner = { ...owner, id: "other-owner" };

function store(): CheckoutPolicyStore & { values: Map<string, string> } {
  const values = new Map([[owner.id, "NONE"], [otherOwner.id, "EMAIL"]]);
  return {
    values,
    async get(ownerId) { return values.has(ownerId) ? { checkoutDataPolicy: values.get(ownerId)! as "NONE" | "EMAIL" } : null; },
    async set(ownerId, checkoutDataPolicy) {
      if (!values.has(ownerId)) return null;
      values.set(ownerId, checkoutDataPolicy);
      return { checkoutDataPolicy };
    },
  };
}

describe("checkout-policy service", () => {
  it("reads and changes only the active actor's policy", async () => {
    const testStore = store();
    const service = createCheckoutPolicyService(testStore);
    await expect(service.getForOwner(owner)).resolves.toEqual({ checkoutDataPolicy: "NONE" });
    await expect(service.update(owner, "NAME_EMAIL_CPF")).resolves.toEqual({ checkoutDataPolicy: "NAME_EMAIL_CPF" });
    expect(testStore.values.get(otherOwner.id)).toBe("EMAIL");
  });

  it("rejects every value outside the closed policy set without mutation", async () => {
    const testStore = store();
    const service = createCheckoutPolicyService(testStore);
    for (const value of ["none", "NAME", "NAME_EMAIL_CPF_ADDRESS ", "", null]) {
      await expect(service.update(owner, value)).rejects.toBeInstanceOf(CheckoutPolicyValidationError);
    }
    expect(testStore.values.get(owner.id)).toBe("NONE");
  });
});

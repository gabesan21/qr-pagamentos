import { getDatabaseClient } from "../db/client";
import { ForbiddenError, requireUserPrincipal, type Principal } from "./authorization";

export const CHECKOUT_DATA_POLICIES = ["NONE", "NAME_EMAIL", "EMAIL", "NAME_EMAIL_CPF", "NAME_EMAIL_CPF_ADDRESS"] as const;
export type CheckoutDataPolicy = (typeof CHECKOUT_DATA_POLICIES)[number];
export type CheckoutPolicyData = Readonly<{ checkoutDataPolicy: CheckoutDataPolicy }>;

export class CheckoutPolicyValidationError extends Error {}

export type CheckoutPolicyStore = Readonly<{
  get(ownerId: string): Promise<CheckoutPolicyData | null>;
  set(ownerId: string, checkoutDataPolicy: CheckoutDataPolicy): Promise<CheckoutPolicyData | null>;
}>;

function validatePolicy(value: unknown): CheckoutDataPolicy {
  if (typeof value === "string" && CHECKOUT_DATA_POLICIES.includes(value as CheckoutDataPolicy)) {
    return value as CheckoutDataPolicy;
  }
  throw new CheckoutPolicyValidationError("Checkout data policy is invalid");
}

function requirePolicy(data: CheckoutPolicyData | null): CheckoutPolicyData {
  if (!data) throw new ForbiddenError("Active account access is required");
  return data;
}

export function createCheckoutPolicyService(store: CheckoutPolicyStore) {
  return {
    async getForOwner(actor: Principal) {
      requireUserPrincipal(actor);
      return requirePolicy(await store.get(actor.id));
    },
    async update(actor: Principal, policy: unknown) {
      requireUserPrincipal(actor);
      return requirePolicy(await store.set(actor.id, validatePolicy(policy)));
    },
  };
}

function prismaStore(): CheckoutPolicyStore {
  const db = getDatabaseClient();
  return {
    async get(ownerId) {
      const user = await db.user.findUnique({ where: { id: ownerId }, select: { checkoutDataPolicy: true } });
      return user as CheckoutPolicyData | null;
    },
    async set(ownerId, checkoutDataPolicy) {
      const result = await db.user.updateMany({ where: { id: ownerId, status: "ACTIVE" }, data: { checkoutDataPolicy } });
      if (result.count !== 1) return null;
      return { checkoutDataPolicy };
    },
  };
}

export function getCheckoutPolicyService() {
  return createCheckoutPolicyService(prismaStore());
}

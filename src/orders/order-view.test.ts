import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Principal } from "../auth/authorization";
import type { CheckoutDataPolicy, CustomerSnapshotV1 } from "./payment-link-order";
import {
  createOrderViewService,
  ORDER_VIEW_LIST_LIMIT,
  toPolicySnapshot,
  type OrderViewStore,
  type StoredOrderView,
} from "./order-view";

const ids = {
  owner: "110e8400-e29b-41d4-a716-446655440011",
  otherOwner: "220e8400-e29b-41d4-a716-446655440022",
  order: "440e8400-e29b-41d4-a716-446655440044",
};

const owner: Principal = { id: ids.owner, username: "owner", email: null, role: "USER", status: "ACTIVE", createdAt: new Date() };
const admin: Principal = { id: "990e8400-e29b-41d4-a716-446655440099", username: "admin", email: null, role: "ADMIN", status: "ACTIVE", createdAt: new Date() };

function stored(overrides: Partial<StoredOrderView> = {}): StoredOrderView {
  return {
    id: ids.order,
    paymentLinkIdentifier: "link-identifier",
    productTitlePtBr: "Doação",
    productTitleEn: "Donation",
    amount: "10.50",
    currencyPairLabel: "BRL/USDT",
    state: "CONFIRMED",
    checkoutDataPolicy: "NONE",
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    settledAt: new Date("2026-07-02T12:00:00.000Z"),
    name: "Ada",
    email: "ada@example.test",
    cpf: "52998224725",
    street: "Rua A",
    number: "10",
    district: "Centro",
    city: "São Paulo",
    stateUf: "SP",
    postalCode: "01001000",
    country: "BR",
    complement: null,
    ...overrides,
  };
}

function storeWith(overrides: Partial<OrderViewStore> = {}): OrderViewStore {
  return {
    listForOwner: vi.fn(async () => []),
    listGlobal: vi.fn(async () => []),
    findForOwner: vi.fn(async () => null),
    findGlobal: vi.fn(async () => null),
    ...overrides,
  };
}

describe("policy-exact customer snapshot projection", () => {
  it.each([
    ["NONE", { name: null, email: null, cpf: null, address: null }],
    ["EMAIL", { name: null, email: "ada@example.test", cpf: null, address: null }],
    ["NAME_EMAIL", { name: "Ada", email: "ada@example.test", cpf: null, address: null }],
    ["NAME_EMAIL_CPF", { name: "Ada", email: "ada@example.test", cpf: "52998224725", address: null }],
    [
      "NAME_EMAIL_CPF_ADDRESS",
      {
        name: "Ada",
        email: "ada@example.test",
        cpf: "52998224725",
        address: { street: "Rua A", number: "10", district: "Centro", city: "São Paulo", stateUf: "SP", postalCode: "01001000", country: "BR", complement: null },
      },
    ],
  ] as const)("exposes exactly the %s tuple", (policy: CheckoutDataPolicy, expected: CustomerSnapshotV1) => {
    expect(toPolicySnapshot(policy, stored({ checkoutDataPolicy: policy }))).toEqual(expected);
  });

  it("drops a persisted member the policy never collected and an incomplete address", () => {
    expect(toPolicySnapshot("EMAIL", stored({ name: "stray", cpf: "52998224725" }))).toEqual({ name: null, email: "ada@example.test", cpf: null, address: null });
    expect(toPolicySnapshot("NAME_EMAIL_CPF_ADDRESS", stored({ street: null })).address).toBeNull();
  });

  it("exposes no customer data when the persisted policy is outside the closed enum", () => {
    const corrupted = "NAME_EMAIL_CPF_ADDRESS_TAX_ID" as CheckoutDataPolicy;
    expect(toPolicySnapshot(corrupted, stored())).toEqual({ name: null, email: null, cpf: null, address: null });
  });
});

describe("order view service", () => {
  it("lists only the principal's orders through the owner seam with the bounded window", async () => {
    const listForOwner = vi.fn(async () => [stored() as never]);
    const listGlobal = vi.fn(async () => []);
    const service = createOrderViewService(storeWith({ listForOwner, listGlobal }));

    await expect(service.listForOwner(owner)).resolves.toHaveLength(1);
    expect(listForOwner).toHaveBeenCalledWith(ids.owner, ORDER_VIEW_LIST_LIMIT);
    expect(listGlobal).not.toHaveBeenCalled();
  });

  it("lists globally only for an active administrator", async () => {
    const listGlobal = vi.fn(async () => []);
    const service = createOrderViewService(storeWith({ listGlobal }));

    await expect(service.listForAdmin(owner)).rejects.toThrow("Administrator access is required");
    await expect(service.listForAdmin({ ...admin, status: "DISABLED" })).rejects.toThrow("Administrator access is required");
    await expect(service.listForAdmin(admin)).resolves.toEqual([]);
    expect(listGlobal).toHaveBeenCalledWith(ORDER_VIEW_LIST_LIMIT);
  });

  it("returns the policy-shaped detail to the owning principal", async () => {
    const findForOwner = vi.fn(async (ownerId: string, orderId: string) => (ownerId === ids.owner && orderId === ids.order ? stored({ checkoutDataPolicy: "NAME_EMAIL" }) : null));
    const service = createOrderViewService(storeWith({ findForOwner }));

    const result = await service.getForOwner(owner, ids.order.toUpperCase());
    expect(result).toEqual({
      kind: "found",
      order: expect.objectContaining({
        id: ids.order,
        paymentLinkIdentifier: "link-identifier",
        amount: "10.50",
        customer: { name: "Ada", email: "ada@example.test", cpf: null, address: null },
      }),
    });
    expect(findForOwner).toHaveBeenCalledWith(ids.owner, ids.order);
  });

  it("makes a cross-owner order indistinguishable from a missing or malformed one", async () => {
    const findForOwner = vi.fn(async (ownerId: string, orderId: string) => (ownerId === ids.owner && orderId === ids.order ? stored() : null));
    const service = createOrderViewService(storeWith({ findForOwner }));

    const missing = await service.getForOwner(owner, "550e8400-e29b-41d4-a716-446655440055");
    const crossOwner = await service.getForOwner({ ...owner, id: ids.otherOwner }, ids.order);
    const malformed = await service.getForOwner(owner, "not-an-order");

    expect(missing).toEqual({ kind: "unavailable" });
    expect(crossOwner).toEqual(missing);
    expect(malformed).toEqual(missing);
    expect(findForOwner).toHaveBeenCalledTimes(2);
  });

  it("returns any owner's order to an administrator with the exact snapshot", async () => {
    const findGlobal = vi.fn(async () => stored({ checkoutDataPolicy: "NAME_EMAIL_CPF_ADDRESS" }));
    const service = createOrderViewService(storeWith({ findGlobal }));

    const result = await service.getForAdmin(admin, ids.order);
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(result.order.customer).toEqual({
      name: "Ada",
      email: "ada@example.test",
      cpf: "52998224725",
      address: { street: "Rua A", number: "10", district: "Centro", city: "São Paulo", stateUf: "SP", postalCode: "01001000", country: "BR", complement: null },
    });
    await expect(service.getForAdmin(owner, ids.order)).rejects.toThrow("Administrator access is required");
  });

  it("never carries verifiers, key material, provider, or credential fields out of the module", async () => {
    const source = await readFile("src/orders/order-view.ts", "utf8");
    for (const forbidden of ["Verifier", "verifier", "nonce", "Nonce", "capability", "Capability", "providerOrder", "provider_order", "apiKey", "credential", "retryKey", "lifecycleVersion"]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }
    const result = await createOrderViewService(storeWith({ findForOwner: async () => stored() })).getForOwner(owner, ids.order);
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(Object.keys(result.order).sort()).toEqual([
      "amount", "checkoutDataPolicy", "createdAt", "currencyPairLabel", "customer", "id",
      "paymentLinkIdentifier", "productTitleEn", "productTitlePtBr", "settledAt", "state", "updatedAt",
    ]);
    expect(Object.keys(result.order.customer).sort()).toEqual(["address", "cpf", "email", "name"]);
  });
});

import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPaymentLinkOrderService,
  normalizeCustomerSnapshotV1,
  type CustomerSnapshotV1,
  type PaymentLinkOrderState,
  type PaymentLinkOrderStore,
  type SettlementInputV1,
  type SettlementResult,
  type StoredLinkOrder,
  type ValidatedSettlementInput,
} from "./payment-link-order";

const ids = {
  owner: "110e8400-e29b-41d4-a716-446655440011",
  otherOwner: "220e8400-e29b-41d4-a716-446655440022",
  link: "330e8400-e29b-41d4-a716-446655440033",
  firstOrder: "440e8400-e29b-41d4-a716-446655440044",
  secondOrder: "550e8400-e29b-41d4-a716-446655440055",
  providerOrder: "660e8400-e29b-41d4-a716-446655440066",
  providerUuid: "770e8400-e29b-41d4-a716-446655440077",
};

const address = {
  street: " Rua A ",
  number: " 10 ",
  district: " Centro ",
  city: " São Paulo ",
  stateUf: " sp ",
  postalCode: "01001-000",
  country: "BR",
  complement: "   ",
};

function input(overrides: Partial<SettlementInputV1> = {}): SettlementInputV1 {
  return {
    ownerId: ids.owner,
    paymentLinkOrderId: ids.firstOrder,
    providerOrderId: ids.providerOrder,
    providerOrderUuid: ids.providerUuid,
    observedProviderReconciliationVersion: 3,
    observedLocalLifecycleVersion: 5,
    authoritativeProviderStatus: "processing",
    ...overrides,
  };
}

function order(id = ids.firstOrder): StoredLinkOrder {
  return {
    id,
    ownerId: ids.owner,
    paymentLinkId: ids.link,
    productId: "880e8400-e29b-41d4-a716-446655440088",
    productPrice: "10.50",
    currencyUuid: "990e8400-e29b-41d4-a716-446655440099",
    exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa",
    checkoutDataPolicy: "NONE",
    state: "CREATED",
    lifecycleVersion: 0,
  };
}

function settlementStore(linkType: "SINGLE_USE" | "REUSABLE" = "SINGLE_USE") {
  const states = new Map<string, PaymentLinkOrderState>([[ids.firstOrder, "PENDING"], [ids.secondOrder, "PENDING"]]);
  const versions = new Map<string, number>([[ids.firstOrder, 5], [ids.secondOrder, 5]]);
  let claimedBy: string | null = null;
  let settledAt: Date | null = null;
  const store: PaymentLinkOrderStore = {
    createFromAvailableLink: vi.fn(async () => order()),
    async settle(candidate: ValidatedSettlementInput, next): Promise<SettlementResult> {
      const current = states.get(candidate.paymentLinkOrderId);
      if (candidate.ownerId !== ids.owner || candidate.providerOrderId !== ids.providerOrder || candidate.providerOrderUuid !== ids.providerUuid || candidate.observedProviderReconciliationVersion !== 3 || candidate.observedLocalLifecycleVersion !== versions.get(candidate.paymentLinkOrderId) || !current) return { kind: "no-op" };
      if (current === next || (next === "REFUNDED" ? current !== "CONFIRMED" : current !== "PENDING" && current !== "INDETERMINATE")) return { kind: "no-op" };
      if (next === "CONFIRMED" && linkType === "SINGLE_USE" && claimedBy && claimedBy !== candidate.paymentLinkOrderId) return { kind: "no-op" };
      if (next === "CONFIRMED" && linkType === "SINGLE_USE") claimedBy = candidate.paymentLinkOrderId;
      if (next === "CONFIRMED") settledAt = new Date();
      states.set(candidate.paymentLinkOrderId, next);
      versions.set(candidate.paymentLinkOrderId, (versions.get(candidate.paymentLinkOrderId) ?? 0) + 1);
      return { kind: "settled", state: next };
    },
  };
  return { store, states, versions, claim: () => claimedBy, settledAt: () => settledAt };
}

describe("CustomerSnapshotV1", () => {
  it("normalizes and accepts only the five closed policy tuples", () => {
    expect(normalizeCustomerSnapshotV1("NONE", { name: null, email: null, cpf: null, address: null })).toEqual({ name: null, email: null, cpf: null, address: null });
    expect(normalizeCustomerSnapshotV1("NAME_EMAIL", { name: " Ada ", email: "ada@example.test", cpf: null, address: null })).toEqual({ name: "Ada", email: "ada@example.test", cpf: null, address: null });
    expect(normalizeCustomerSnapshotV1("EMAIL", { name: null, email: "ada@example.test", cpf: null, address: null })).toEqual({ name: null, email: "ada@example.test", cpf: null, address: null });
    expect(normalizeCustomerSnapshotV1("NAME_EMAIL_CPF", { name: "Ada", email: "ada@example.test", cpf: "529.982.247-25", address: null })).toEqual({ name: "Ada", email: "ada@example.test", cpf: "52998224725", address: null });
    expect(normalizeCustomerSnapshotV1("NAME_EMAIL_CPF_ADDRESS", { name: "Ada", email: "ada@example.test", cpf: "52998224725", address })).toEqual({
      name: "Ada", email: "ada@example.test", cpf: "52998224725",
      address: { street: "Rua A", number: "10", district: "Centro", city: "São Paulo", stateUf: "SP", postalCode: "01001000", country: "BR", complement: null },
    } satisfies CustomerSnapshotV1);
  });

  it("rejects extra, malformed, foreign, and policy-incompatible customer fields", () => {
    expect(normalizeCustomerSnapshotV1("NONE", {})).toBeNull();
    expect(normalizeCustomerSnapshotV1("NONE", { email: "ada@example.test" })).toBeNull();
    expect(normalizeCustomerSnapshotV1("EMAIL", { email: "ada@example.test", role: "browser" })).toBeNull();
    expect(normalizeCustomerSnapshotV1("NAME_EMAIL_CPF", { name: "Ada", email: "ada@example.test", cpf: "11111111111" })).toBeNull();
    expect(normalizeCustomerSnapshotV1("NAME_EMAIL_CPF_ADDRESS", { name: "Ada", email: "ada@example.test", cpf: "52998224725", address: { ...address, country: "US" } })).toBeNull();
    expect(normalizeCustomerSnapshotV1("NAME_EMAIL_CPF_ADDRESS", { name: "Ada", email: "ada@example.test", cpf: "52998224725", address: { ...address, unknown: "field" } })).toBeNull();
  });
});

describe("payment-link order service", () => {
  it("keeps unavailable creation opaque before the store sees a malformed link", async () => {
    const createFromAvailableLink = vi.fn();
    const service = createPaymentLinkOrderService({ createFromAvailableLink, settle: vi.fn() } as unknown as PaymentLinkOrderStore);
    await expect(service.create("not-a-link", {})).resolves.toEqual({ kind: "unavailable" });
    expect(createFromAvailableLink).not.toHaveBeenCalled();
  });

  it.each([
    ["new", "PENDING"],
    ["processing", "CONFIRMED"],
    ["paid", "CONFIRMED"],
    ["finished", "CONFIRMED"],
    ["rejected", "REJECTED"],
    ["canceled", "CANCELLED"],
    ["expired", "EXPIRED"],
    ["refunded", "REFUNDED"],
  ] as const)("maps only authoritative %s evidence to %s", async (authoritativeProviderStatus, expected) => {
    const effects = settlementStore("REUSABLE");
    if (authoritativeProviderStatus === "new") effects.states.set(ids.firstOrder, "INDETERMINATE");
    if (authoritativeProviderStatus === "refunded") effects.states.set(ids.firstOrder, "CONFIRMED");
    const service = createPaymentLinkOrderService(effects.store);
    await expect(service.settle(input({ authoritativeProviderStatus }))).resolves.toEqual({ kind: "settled", state: expected });
  });

  it("fences unknown, stale, cross-owner, unattached, and created-order settlement inputs", async () => {
    const effects = settlementStore();
    const service = createPaymentLinkOrderService(effects.store);
    await expect(service.settle(input({ authoritativeProviderStatus: "notification" }))).resolves.toEqual({ kind: "no-op" });
    await expect(service.settle(input({ observedLocalLifecycleVersion: 4 }))).resolves.toEqual({ kind: "no-op" });
    await expect(service.settle(input({ ownerId: ids.otherOwner }))).resolves.toEqual({ kind: "no-op" });
    await expect(service.settle(input({ providerOrderId: ids.secondOrder }))).resolves.toEqual({ kind: "no-op" });
    effects.states.set(ids.firstOrder, "CREATED");
    await expect(service.settle(input())).resolves.toEqual({ kind: "no-op" });
  });

  it("permits only one concurrent single-use winner and preserves that claim through refund", async () => {
    const effects = settlementStore();
    const service = createPaymentLinkOrderService(effects.store);
    const [first, second] = await Promise.all([
      service.settle(input()),
      service.settle(input({ paymentLinkOrderId: ids.secondOrder })),
    ]);
    expect([first.kind, second.kind].sort()).toEqual(["no-op", "settled"]);
    const winner = first.kind === "settled" ? ids.firstOrder : ids.secondOrder;
    expect(effects.claim()).toBe(winner);
    const winnerInput = input({ paymentLinkOrderId: winner, observedLocalLifecycleVersion: 6, authoritativeProviderStatus: "refunded" });
    await expect(service.settle(winnerInput)).resolves.toEqual({ kind: "settled", state: "REFUNDED" });
    expect(effects.claim()).toBe(winner);
    expect(effects.settledAt()).toBeInstanceOf(Date);
  });

  it("allows independent reusable settlements", async () => {
    const effects = settlementStore("REUSABLE");
    const service = createPaymentLinkOrderService(effects.store);
    await expect(Promise.all([service.settle(input()), service.settle(input({ paymentLinkOrderId: ids.secondOrder }))])).resolves.toEqual([
      { kind: "settled", state: "CONFIRMED" },
      { kind: "settled", state: "CONFIRMED" },
    ]);
  });

  it("contains no route, provider client, log, or public projection dependency", async () => {
    const source = await readFile(new URL("./payment-link-order.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/src\/app|pricing-orders-client|console\.|PublicPaymentLink/);
  });
});

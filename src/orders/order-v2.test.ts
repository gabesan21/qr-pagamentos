import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "../auth/authorization";
import {
  OrderV2DependencyError,
  OrderV2ValidationError,
  createOrderV2Service,
  totalFromLines,
  type OrderV2Store,
  type SettlementInputV2,
  type StoredOrderV2,
} from "./order-v2";

const ids = {
  owner: "110e8400-e29b-41d4-a716-446655440011",
  link: "330e8400-e29b-41d4-a716-446655440033",
  order: "440e8400-e29b-41d4-a716-446655440044",
  pair: "990e8400-e29b-41d4-a716-446655440099",
  providerOrder: "660e8400-e29b-41d4-a716-446655440066",
  providerUuid: "770e8400-e29b-41d4-a716-446655440077",
};

const actor = { id: ids.owner, username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const admin = { ...actor, role: "ADMIN" as const };

const blankCustomer = { name: null, email: null, cpf: null, address: null };

function adHocOrder(): StoredOrderV2 {
  return {
    id: ids.order,
    ownerId: ids.owner,
    source: "AD_HOC",
    paymentLinkV2Id: null,
    state: null,
    lifecycleVersion: 0,
    amount: "10.25",
    currencyUuid: ids.pair,
    exchangeCurrencyUuid: ids.providerUuid,
    descriptionPtBr: "Doação",
    descriptionEn: "Donation",
    checkoutDataPolicy: "NONE",
    lines: [],
  };
}

function adHocInput(overrides: Record<string, unknown> = {}) {
  return {
    amount: "10.25",
    currencyPairId: ids.pair,
    descriptionPtBr: "Doação",
    descriptionEn: "Donation",
    checkoutDataPolicy: "NONE",
    customer: JSON.stringify(blankCustomer),
    ...overrides,
  };
}

function storeWith(overrides: Partial<OrderV2Store> = {}): OrderV2Store {
  return {
    createAdHoc: vi.fn(async () => adHocOrder()),
    createFromAvailableLink: vi.fn(async () => null),
    settle: vi.fn(async () => ({ kind: "no-op" }) as const),
    ...overrides,
  };
}

describe("totalFromLines", () => {
  it("computes exact-decimal totals with canonical rendering", () => {
    expect(totalFromLines([{ quantity: 2, unitPrice: "10.50" }, { quantity: 3, unitPrice: "0.25" }])).toBe("21.75");
    expect(totalFromLines([{ quantity: 1, unitPrice: "0.000001" }, { quantity: 1, unitPrice: "0.000001" }])).toBe("0.000002");
    expect(totalFromLines([{ quantity: 2, unitPrice: "1" }])).toBe("2");
    expect(totalFromLines([{ quantity: 9999, unitPrice: "999999999999.999999" }])).toBe("9998999999999999.990001");
  });
});

describe("order-v2 ad-hoc creation", () => {
  it("creates a stateless owner-scoped AD_HOC order with the exact policy tuple", async () => {
    const store = storeWith();
    const service = createOrderV2Service(store);

    const result = await service.createAdHoc(actor, adHocInput());
    expect(result.kind).toBe("created");
    expect(result.order.source).toBe("AD_HOC");
    expect(result.order.state).toBeNull();
    expect(result.order.paymentLinkV2Id).toBeNull();
    expect(store.createAdHoc).toHaveBeenCalledWith(ids.owner, expect.objectContaining({
      amount: "10.25",
      checkoutDataPolicy: "NONE",
      customer: blankCustomer,
    }));
  });

  it("requires an active merchant principal", async () => {
    const service = createOrderV2Service(storeWith());
    await expect(service.createAdHoc(admin, adHocInput())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each([
    ["policy outside the closed set", { checkoutDataPolicy: "CPF_ONLY" }],
    ["malformed amount", { amount: "10.2.5" }],
    ["non-positive amount", { amount: "0" }],
    ["too many fraction digits", { amount: "0.0000001" }],
    ["missing description", { descriptionPtBr: "" }],
    ["multi-line description", { descriptionEn: "two\nlines" }],
    ["malformed currency pair", { currencyPairId: "pair" }],
    ["malformed customer JSON", { customer: "{" }],
    ["tuple beyond the policy", { customer: JSON.stringify({ ...blankCustomer, name: "Ana" }) }],
    ["missing tuple member", { checkoutDataPolicy: "EMAIL" }],
  ])("rejects %s", async (_label, overrides) => {
    const service = createOrderV2Service(storeWith());
    await expect(service.createAdHoc(actor, adHocInput(overrides))).rejects.toBeInstanceOf(OrderV2ValidationError);
  });

  it("accepts the exact EMAIL tuple", async () => {
    const store = storeWith();
    const service = createOrderV2Service(store);
    await service.createAdHoc(actor, adHocInput({ checkoutDataPolicy: "EMAIL", customer: JSON.stringify({ ...blankCustomer, email: "ana@example.com" }) }));
    expect(store.createAdHoc).toHaveBeenCalledWith(ids.owner, expect.objectContaining({ checkoutDataPolicy: "EMAIL" }));
  });

  it("maps an unavailable dependency to the typed dependency error", async () => {
    const store = storeWith({ createAdHoc: vi.fn(async () => "dependency-unavailable" as const) });
    const service = createOrderV2Service(store);
    await expect(service.createAdHoc(actor, adHocInput())).rejects.toBeInstanceOf(OrderV2DependencyError);
  });
});

describe("order-v2 LINK creation seam", () => {
  it("is server-only and rejects malformed link identities without store work", async () => {
    const store = storeWith();
    const service = createOrderV2Service(store);
    expect(await service.createFromLink("not-a-uuid", blankCustomer)).toBeNull();
    expect(store.createFromAvailableLink).not.toHaveBeenCalled();
  });

  it("delegates canonical identities to the store seam", async () => {
    const linkOrder = { ...adHocOrder(), source: "LINK" as const, paymentLinkV2Id: ids.link, state: "CREATED" as const };
    const store = storeWith({ createFromAvailableLink: vi.fn(async () => linkOrder) });
    const service = createOrderV2Service(store);
    const created = await service.createFromLink(ids.link.toUpperCase(), blankCustomer);
    expect(created?.state).toBe("CREATED");
    expect(store.createFromAvailableLink).toHaveBeenCalledWith(ids.link, blankCustomer, expect.objectContaining({ id: expect.any(String) }));
  });
});

describe("order-v2 settlement", () => {
  function input(overrides: Partial<SettlementInputV2> = {}): SettlementInputV2 {
    return {
      ownerId: ids.owner,
      orderV2Id: ids.order,
      providerOrderId: ids.providerOrder,
      providerOrderUuid: ids.providerUuid,
      observedProviderReconciliationVersion: 3,
      observedLocalLifecycleVersion: 5,
      authoritativeProviderStatus: "processing",
      ...overrides,
    };
  }

  it("maps authoritative statuses through the settlement map V1", async () => {
    const cases: Array<[string, string]> = [
      ["new", "PENDING"],
      ["processing", "CONFIRMED"],
      ["paid", "CONFIRMED"],
      ["finished", "CONFIRMED"],
      ["rejected", "REJECTED"],
      ["canceled", "CANCELLED"],
      ["expired", "EXPIRED"],
      ["refunded", "REFUNDED"],
    ];
    for (const [status, expected] of cases) {
      const store = storeWith({ settle: vi.fn(async () => ({ kind: "settled", state: expected }) as never) });
      const service = createOrderV2Service(store);
      await service.settle(input({ authoritativeProviderStatus: status }));
      expect(store.settle).toHaveBeenCalledWith(expect.objectContaining({ authoritativeProviderStatus: status }), expected, expect.any(Date));
    }
  });

  it.each([
    ["malformed owner", { ownerId: "owner" }],
    ["malformed order", { orderV2Id: "order" }],
    ["negative version", { observedLocalLifecycleVersion: -1 }],
    ["unknown provider status", { authoritativeProviderStatus: "chargeback" }],
  ])("is a fenced no-op for %s", async (_label, overrides) => {
    const store = storeWith();
    const service = createOrderV2Service(store);
    expect(await service.settle(input(overrides))).toEqual({ kind: "no-op" });
    expect(store.settle).not.toHaveBeenCalled();
  });
});

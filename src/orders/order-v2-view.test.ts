import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "../auth/authorization";
import {
  createOrderV2ViewService,
  toPolicySnapshotV2,
  type OrderV2ViewStore,
  type StoredOrderV2View,
} from "./order-v2-view";

const ownerId = "110e8400-e29b-41d4-a716-446655440011";
const orderId = "440e8400-e29b-41d4-a716-446655440044";

const owner = { id: ownerId, username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const otherOwner = { ...owner, id: "220e8400-e29b-41d4-a716-446655440022" };
const admin = { ...owner, role: "ADMIN" as const };

function stored(overrides: Partial<StoredOrderV2View> = {}): StoredOrderV2View {
  return {
    id: orderId,
    source: "AD_HOC",
    paymentLinkV2Identifier: null,
    amount: "10.25",
    currencyUuid: "990e8400-e29b-41d4-a716-446655440099",
    exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa",
    descriptionPtBr: "Doação",
    descriptionEn: "Donation",
    state: null,
    checkoutDataPolicy: "NAME_EMAIL",
    createdAt: new Date("2026-07-25T12:00:00.000Z"),
    updatedAt: new Date("2026-07-25T12:00:00.000Z"),
    settledAt: null,
    name: "Ana",
    email: "ana@example.com",
    cpf: "52998224725",
    street: null,
    number: null,
    district: null,
    city: null,
    stateUf: null,
    postalCode: null,
    country: null,
    complement: null,
    lines: [],
    comments: [{ id: "550e8400-e29b-41d4-a716-446655440055", body: "nota", version: 0, createdAt: new Date("2026-07-25T12:00:00.000Z"), editedAt: null }],
    latestLocalOutcome: { outcome: "LOCAL_FINALIZED", note: null, createdAt: new Date("2026-07-25T12:30:00.000Z") },
    ...overrides,
  };
}

function storeWith(overrides: Partial<OrderV2ViewStore> = {}): OrderV2ViewStore {
  return {
    listForOwner: vi.fn(async () => [stored()]),
    listGlobal: vi.fn(async () => [stored()]),
    findForOwner: vi.fn(async () => stored()),
    findGlobal: vi.fn(async () => stored()),
    ...overrides,
  };
}

describe("order-v2 view service", () => {
  it("exposes state and the current local outcome as separate fields", async () => {
    const service = createOrderV2ViewService(storeWith());
    const result = await service.getForOwner(owner, orderId);
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;
    expect(result.order.state).toBeNull();
    expect(result.order.currentLocalOutcome).toEqual({ outcome: "LOCAL_FINALIZED", note: null, createdAt: new Date("2026-07-25T12:30:00.000Z") });
    expect(result.order.customer).toEqual({ name: "Ana", email: "ana@example.com", cpf: null, address: null });
    expect(result.order.comments).toHaveLength(1);
    expect(result.order).not.toHaveProperty("name");
    expect(result.order).not.toHaveProperty("cpf");
  });

  it("scopes owner reads to the principal and exposes only summaries on lists", async () => {
    const store = storeWith();
    const service = createOrderV2ViewService(store);
    const list = await service.listForOwner(owner);
    expect(store.listForOwner).toHaveBeenCalledWith(ownerId, 50);
    expect(list[0]).not.toHaveProperty("customer");
    expect(list[0]?.currentLocalOutcome?.outcome).toBe("LOCAL_FINALIZED");
  });

  it("shares one opaque unavailable outcome for cross-owner, malformed, and missing identities", async () => {
    const store = storeWith({ findForOwner: vi.fn(async () => null) });
    const service = createOrderV2ViewService(store);
    expect(await service.getForOwner(otherOwner, orderId)).toEqual({ kind: "unavailable" });
    expect(await service.getForOwner(owner, "not-an-order")).toEqual({ kind: "unavailable" });
    expect(await service.getForOwner(owner, orderId)).toEqual({ kind: "unavailable" });
    expect(store.findForOwner).toHaveBeenCalledTimes(2);
    expect(store.findForOwner).toHaveBeenNthCalledWith(1, otherOwner.id, orderId);
  });

  it("re-authorizes roles on every entry point", async () => {
    const service = createOrderV2ViewService(storeWith());
    await expect(service.listForOwner(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.listForAdmin(owner)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.getForAdmin(owner, orderId)).rejects.toBeInstanceOf(ForbiddenError);
    const result = await service.getForAdmin(admin, orderId.toUpperCase());
    expect(result.kind).toBe("found");
  });
});

describe("toPolicySnapshotV2", () => {
  it("exposes exactly the policy tuple and fails closed on a stray policy", () => {
    const columns = stored();
    expect(toPolicySnapshotV2("NONE", columns)).toEqual({ name: null, email: null, cpf: null, address: null });
    expect(toPolicySnapshotV2("EMAIL", columns)).toEqual({ name: null, email: "ana@example.com", cpf: null, address: null });
    expect(toPolicySnapshotV2("NAME_EMAIL_CPF", columns)).toEqual({ name: "Ana", email: "ana@example.com", cpf: "52998224725", address: null });
    expect(toPolicySnapshotV2("BOGUS" as never, columns)).toEqual({ name: null, email: null, cpf: null, address: null });
  });

  it("builds the address only from a complete stored tuple", () => {
    const withAddress = stored({ street: "Rua A", number: "10", district: "Centro", city: "São Paulo", stateUf: "SP", postalCode: "01001000", country: "BR" });
    const snapshot = toPolicySnapshotV2("NAME_EMAIL_CPF_ADDRESS", withAddress);
    expect(snapshot.address).toEqual({ street: "Rua A", number: "10", district: "Centro", city: "São Paulo", stateUf: "SP", postalCode: "01001000", country: "BR", complement: null });
    expect(toPolicySnapshotV2("NAME_EMAIL_CPF_ADDRESS", stored()).address).toBeNull();
  });
});

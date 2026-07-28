import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "../auth/authorization";
import {
  createOrderV2ViewService,
  toOrderV2Summary,
  toPolicySnapshotV2,
  type OrderV2SummaryRow,
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
    lifecycleVersion: 3,
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
    expect(result.order.payer).toEqual(result.order.customer);
    expect(result.order.lifecycleVersion).toBe(3);
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
    expect(list[0]).not.toHaveProperty("lifecycleVersion");
    expect(list[0]).not.toHaveProperty("name");
    expect(list[0]?.payer).toEqual({ name: "Ana", email: "ana@example.com", cpf: null, address: null });
    expect(list[0]?.currentLocalOutcome?.outcome).toBe("LOCAL_FINALIZED");
  });

  it("never carries verifiers, key material, provider, credential, or retry-key fields out of the module", async () => {
    const source = await readFile("src/orders/order-v2-view.ts", "utf8");
    for (const forbidden of ["Verifier", "verifier", "nonce", "Nonce", "capability", "Capability", "providerOrder", "provider_order", "apiKey", "credential", "retryKey"]) {
      expect(source.includes(forbidden), forbidden).toBe(false);
    }

    const service = createOrderV2ViewService(storeWith({ findForOwner: async () => stored() }));
    const result = await service.getForOwner(owner, orderId);
    expect(result.kind).toBe("found");
    if (result.kind !== "found") return;

    expect(Object.keys(result.order).sort()).toEqual([
      "amount", "checkoutDataPolicy", "comments", "createdAt", "currencyUuid", "currentLocalOutcome", "customer",
      "descriptionEn", "descriptionPtBr", "exchangeCurrencyUuid", "id", "lifecycleVersion", "lines", "payer",
      "paymentLinkV2Identifier", "settledAt", "source", "state", "updatedAt",
    ]);
    expect(Object.keys(result.order.customer).sort()).toEqual(["address", "cpf", "email", "name"]);

    const list = await service.listForOwner(owner);
    expect(Object.keys(list[0] ?? {}).sort()).toEqual([
      "amount", "checkoutDataPolicy", "createdAt", "currencyUuid", "currentLocalOutcome", "descriptionEn",
      "descriptionPtBr", "exchangeCurrencyUuid", "id", "payer", "paymentLinkV2Identifier", "settledAt", "source",
      "state", "updatedAt",
    ]);
  });

  it("applies the policy guard through the exported summary mapping used by directories", () => {
    const row = {
      id: orderId,
      source: "AD_HOC",
      state: null,
      amount: "10.25",
      currencyUuid: "990e8400-e29b-41d4-a716-446655440099",
      exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa",
      descriptionPtBr: "Doação",
      descriptionEn: "Donation",
      checkoutDataPolicy: "EMAIL",
      createdAt: new Date("2026-07-25T12:00:00.000Z"),
      updatedAt: new Date("2026-07-25T12:00:00.000Z"),
      settledAt: null,
      paymentLink: { identifier: "link-id" },
      localOutcomes: [],
      name: "Ana",
      email: "ana@example.com",
      cpf: "52998224725",
      street: "Rua A",
      number: "10",
      district: "Centro",
      city: "São Paulo",
      stateUf: "SP",
      postalCode: "01001000",
      country: "BR",
      complement: null,
    } satisfies OrderV2SummaryRow;

    const summary = toOrderV2Summary(row);
    expect(summary.payer).toEqual({ name: null, email: "ana@example.com", cpf: null, address: null });
    expect(summary).not.toHaveProperty("name");
    expect(summary).not.toHaveProperty("email");
    expect(summary).not.toHaveProperty("cpf");
    expect(summary).not.toHaveProperty("customer");
    expect(summary).not.toHaveProperty("lifecycleVersion");
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

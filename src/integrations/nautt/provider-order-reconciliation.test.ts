import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createOwnerPricingOrdersService, OwnerPricingOrdersError } from "./owner-pricing-orders";
import {
  ACTIVE_ORDER_STATUSES,
  FINAL_ORDER_STATUSES,
  type ProviderOrderStore,
  type StoredProviderOrder,
} from "./provider-order-store";
import { NAUTT_ORDER_STATUSES, type NauttOrderStatus, type NauttOrderView } from "./pricing-orders-client";

const ownerId = "110e8400-e29b-41d4-a716-446655440011";
const localOrderId = "220e8400-e29b-41d4-a716-446655440022";
const quoteUuid = "330e8400-e29b-41d4-a716-446655440033";
const providerOrderUuid = "440e8400-e29b-41d4-a716-446655440044";

function view(status: NauttOrderStatus = "processing"): NauttOrderView {
  return {
    orderUuid: providerOrderUuid,
    status,
    fiatAmount: "1000.0000",
    cryptoAmount: "196.0784",
    nauttQuote: "5.1000",
    expiresAt: new Date("2026-07-18T22:00:00.000Z"),
    paymentMethod: "pix",
  };
}

function row(overrides: Partial<StoredProviderOrder> = {}): StoredProviderOrder {
  return {
    id: localOrderId,
    ownerId,
    quoteUuid,
    providerOrderUuid,
    creationState: "CREATED",
    status: "new",
    fiatAmount: "1000.00",
    cryptoAmount: "196.07",
    nauttQuote: "5.10",
    providerExpiresAt: new Date("2026-07-18T21:00:00.000Z"),
    paymentMethod: "pix",
    pixCopyPaste: null,
    pixQrcodeUrl: null,
    reconciliationVersion: 1,
    ...overrides,
  };
}

function harness(observed: StoredProviderOrder | null, reconciled = view()) {
  const getOrder = vi.fn().mockResolvedValue(view());
  const store = {
    register: vi.fn(),
    claimForCreation: vi.fn(),
    releasePreDispatch: vi.fn(),
    markIndeterminate: vi.fn(),
    completeCreation: vi.fn(),
    findPollable: vi.fn().mockResolvedValue(observed),
    findRecoverable: vi.fn().mockResolvedValue(observed),
    reconcile: vi.fn().mockResolvedValue(row({
      creationState: "CREATED",
      status: reconciled.status,
      fiatAmount: reconciled.fiatAmount,
      cryptoAmount: reconciled.cryptoAmount,
      nauttQuote: reconciled.nauttQuote,
      providerExpiresAt: reconciled.expiresAt,
      paymentMethod: reconciled.paymentMethod,
      reconciliationVersion: 2,
    })),
  } satisfies ProviderOrderStore;
  const credentials = { getDecryptedApiKey: vi.fn().mockResolvedValue("owner-secret") };
  const adapter = { createQuote: vi.fn(), createOnrampOrder: vi.fn(), getOrder };
  return { service: createOwnerPricingOrdersService(credentials, adapter, store), store, credentials, getOrder };
}

describe("provider order transition lattice", () => {
  it("partitions every documented status without inventing active ordering", () => {
    expect([...ACTIVE_ORDER_STATUSES, ...FINAL_ORDER_STATUSES]).toEqual(NAUTT_ORDER_STATUSES);
    expect(new Set([...ACTIVE_ORDER_STATUSES, ...FINAL_ORDER_STATUSES]).size).toBe(NAUTT_ORDER_STATUSES.length);
  });

  it("polls one active owner-bound record once and applies the shared CAS", async () => {
    const observed = row();
    const { service, store, credentials, getOrder } = harness(observed);

    await expect(service.pollOrder(ownerId, localOrderId)).resolves.toMatchObject({ status: "processing" });

    expect(credentials.getDecryptedApiKey).toHaveBeenCalledOnce();
    expect(getOrder).toHaveBeenCalledOnce();
    expect(getOrder).toHaveBeenCalledWith({ apiKey: "owner-secret", orderUuid: providerOrderUuid });
    expect(store.reconcile).toHaveBeenCalledWith(observed, expect.objectContaining({ status: "processing" }));
  });

  it("returns the fresh terminal row after a stale CAS without a second provider read", async () => {
    const final = view("finished");
    const { service, store, getOrder } = harness(row(), final);
    store.reconcile.mockResolvedValueOnce(row({
      status: "finished",
      fiatAmount: final.fiatAmount,
      cryptoAmount: final.cryptoAmount,
      nauttQuote: final.nauttQuote,
      providerExpiresAt: final.expiresAt,
      paymentMethod: final.paymentMethod,
      reconciliationVersion: 9,
    }));

    await expect(service.pollOrder(ownerId, localOrderId)).resolves.toMatchObject({ status: "finished" });
    expect(getOrder).toHaveBeenCalledOnce();
  });

  it("recovers only a known durable provider UUID with one authoritative read", async () => {
    const ambiguous = row({ creationState: "INDETERMINATE", status: null, fiatAmount: null, cryptoAmount: null, nauttQuote: null, providerExpiresAt: null, paymentMethod: null });
    const { service, store, getOrder } = harness(ambiguous);

    await expect(service.recoverOrder(ownerId, localOrderId)).resolves.toMatchObject({ status: "processing" });
    expect(store.findRecoverable).toHaveBeenCalledWith(ownerId, localOrderId);
    expect(getOrder).toHaveBeenCalledOnce();
  });

  it("does not decrypt or fetch for unknown, cross-owner, final, or unknown-ID ambiguity", async () => {
    const { service, credentials, getOrder } = harness(null);

    await expect(service.pollOrder(ownerId, localOrderId)).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    await expect(service.recoverOrder(ownerId, localOrderId)).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(credentials.getDecryptedApiKey).not.toHaveBeenCalled();
    expect(getOrder).not.toHaveBeenCalled();
  });

  it("leaves state unchanged after one failed authoritative read", async () => {
    const { service, store, getOrder } = harness(row());
    getOrder.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(service.pollOrder(ownerId, localOrderId)).rejects.toBeInstanceOf(OwnerPricingOrdersError);
    expect(getOrder).toHaveBeenCalledOnce();
    expect(store.reconcile).not.toHaveBeenCalled();
  });
});

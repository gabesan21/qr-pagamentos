import { describe, expect, it, vi } from "vitest";

import type { DirectoryReadInput } from "@/data-directory/server/directory-page";

import {
  createPaymentLinkV2DirectoryAdapter,
  createPaymentLinkV2ViewService,
  derivePaymentLinkV2State,
  validatePaymentLinkV2DirectoryTuple,
  type PaymentLinkV2DirectoryRow,
  type PaymentLinkV2ViewStore,
  type PaymentLinkV2WindowQuery,
  type StoredPaymentLinkV2View,
} from "./payment-link-v2-view";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-07-25T12:00:00.000Z");
const now = () => NOW;

const merchant = { id: "440e8400-e29b-41d4-a716-446655440001", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const administrator = { ...merchant, id: "440e8400-e29b-41d4-a716-446655440099", role: "ADMIN" as const };

function stored(overrides: Partial<StoredPaymentLinkV2View> = {}): StoredPaymentLinkV2View {
  return {
    id: "440e8400-e29b-41d4-a716-446655440010",
    identifier: "abcdefghijklmnopqrstuvwx",
    compositionKind: "FIXED_AMOUNT",
    descriptionPtBr: "Doação",
    descriptionEn: "Donation",
    amount: "10.50",
    currencyPairLabel: "BRL/USDT",
    linkType: "REUSABLE",
    expiresAt: null,
    active: true,
    paid: false,
    createdAt: new Date("2026-07-01T12:00:00.000Z"),
    updatedAt: new Date("2026-07-02T12:00:00.000Z"),
    lines: [],
    ...overrides,
  };
}

function createStore(rows: StoredPaymentLinkV2View[] = [], detail: StoredPaymentLinkV2View | null = null) {
  const listWindow = vi.fn<(query: PaymentLinkV2WindowQuery) => Promise<StoredPaymentLinkV2View[]>>(async () => rows);
  const findForOwner = vi.fn<(ownerId: string, id: string) => Promise<StoredPaymentLinkV2View | null>>(async () => detail);
  const store: PaymentLinkV2ViewStore = { listWindow, findForOwner };
  return { store, listWindow, findForOwner };
}

function readInput(overrides: Partial<DirectoryReadInput<PaymentLinkV2DirectoryRow>> = {}): DirectoryReadInput<PaymentLinkV2DirectoryRow> {
  return {
    scope: { purpose: "MERCHANT_OWN", ownerId: merchant.id },
    filters: {},
    direction: "forward",
    limit: 26,
    order: [],
    ...overrides,
  };
}

describe("derivePaymentLinkV2State", () => {
  it("derives the closed lifecycle vocabulary with inactive > expired > paid > active precedence", () => {
    const future = new Date("2026-08-01T00:00:00.000Z");
    const past = new Date("2026-07-01T00:00:00.000Z");
    expect(derivePaymentLinkV2State({ active: true, expiresAt: null, paid: false }, NOW)).toBe("active");
    expect(derivePaymentLinkV2State({ active: true, expiresAt: future, paid: false }, NOW)).toBe("active");
    expect(derivePaymentLinkV2State({ active: true, expiresAt: null, paid: true }, NOW)).toBe("paid");
    expect(derivePaymentLinkV2State({ active: true, expiresAt: past, paid: false }, NOW)).toBe("expired");
    expect(derivePaymentLinkV2State({ active: true, expiresAt: NOW, paid: true }, NOW)).toBe("expired");
    expect(derivePaymentLinkV2State({ active: false, expiresAt: null, paid: true }, NOW)).toBe("inactive");
    expect(derivePaymentLinkV2State({ active: false, expiresAt: past, paid: false }, NOW)).toBe("inactive");
  });
});

describe("validatePaymentLinkV2DirectoryTuple", () => {
  it("accepts only the (createdAtMs, immutable UUID) pair", () => {
    expect(validatePaymentLinkV2DirectoryTuple([NOW.getTime(), merchant.id])).toBe(true);
    expect(validatePaymentLinkV2DirectoryTuple([NOW.getTime()])).toBe(false);
    expect(validatePaymentLinkV2DirectoryTuple([NOW.getTime(), "not-a-uuid"])).toBe(false);
    expect(validatePaymentLinkV2DirectoryTuple(["2026-07-25", merchant.id])).toBe(false);
    expect(validatePaymentLinkV2DirectoryTuple([Number.MAX_SAFE_INTEGER + 1, merchant.id])).toBe(false);
    expect(validatePaymentLinkV2DirectoryTuple([NOW.getTime(), merchant.id, "extra"])).toBe(false);
  });
});

describe("payment-link V2 directory adapter", () => {
  it("rejects a non-merchant scope before any store read", async () => {
    const { store, listWindow } = createStore();
    const adapter = createPaymentLinkV2DirectoryAdapter(store, now);
    await expect(adapter.readWindow(readInput({ scope: { purpose: "ADMIN_GLOBAL" } }))).rejects.toThrow("merchant-own scope");
    expect(listWindow).not.toHaveBeenCalled();
  });

  it("translates the registered filters, search, and bounded limit into the window query", async () => {
    const { store, listWindow } = createStore();
    const adapter = createPaymentLinkV2DirectoryAdapter(store, now);
    await adapter.readWindow(readInput({
      filters: { state: ["active", "paid"], type: "REUSABLE", kind: ["FIXED_AMOUNT"], q: "donation", bogus: "ignored" },
      limit: 51,
    }));
    expect(listWindow).toHaveBeenCalledWith({
      ownerId: merchant.id,
      states: ["active", "paid"],
      linkTypes: ["REUSABLE"],
      compositionKinds: ["FIXED_AMOUNT"],
      search: "donation",
      direction: "forward",
      limit: 51,
      now: NOW,
    });
  });

  it("drops filter values outside the closed vocabularies and blank search", async () => {
    const { store, listWindow } = createStore();
    const adapter = createPaymentLinkV2DirectoryAdapter(store, now);
    await adapter.readWindow(readInput({ filters: { state: ["paid", "archived"], q: "" } }));
    expect(listWindow).toHaveBeenCalledWith(expect.objectContaining({ states: ["paid"], linkTypes: [], compositionKinds: [] }));
    expect(listWindow.mock.calls[0][0]).not.toHaveProperty("search");
  });

  it("translates a valid seek tuple for both directions and rejects a malformed one", async () => {
    const { store, listWindow } = createStore();
    const adapter = createPaymentLinkV2DirectoryAdapter(store, now);
    await adapter.readWindow(readInput({ direction: "backward", seek: [NOW.getTime(), merchant.id.toUpperCase()] }));
    expect(listWindow).toHaveBeenCalledWith(expect.objectContaining({
      direction: "backward",
      seek: { createdAtMs: NOW.getTime(), id: merchant.id },
    }));
    await expect(adapter.readWindow(readInput({ seek: ["oops", merchant.id] }))).rejects.toThrow("cursor tuple");
  });

  it("maps stored rows into directory rows with the read-time state and share path", async () => {
    const rows = [
      stored({ id: merchant.id, active: true, paid: true }),
      stored({ active: false }),
      stored({ expiresAt: new Date("2026-07-01T00:00:00.000Z") }),
    ];
    const { store } = createStore(rows);
    const adapter = createPaymentLinkV2DirectoryAdapter(store, now);
    const window = await adapter.readWindow(readInput());
    expect(window.map((row) => row.state)).toEqual(["paid", "inactive", "expired"]);
    expect(window[0].sharePath).toBe("/pay/abcdefghijklmnopqrstuvwx");
    expect(window[0].currencyPairLabel).toBe("BRL/USDT");
  });
});

describe("payment-link V2 owner detail view", () => {
  it("returns the found link with its derived state for the owning merchant", async () => {
    const detail = stored({ lines: [{ position: 1, quantity: 2, titlePtBr: "Café", titleEn: "Coffee", unitPrice: "9.9" }] });
    const { store, findForOwner } = createStore([], detail);
    const service = createPaymentLinkV2ViewService(store, now);
    const result = await service.getForOwner(merchant, detail.id.toUpperCase());
    expect(findForOwner).toHaveBeenCalledWith(merchant.id, detail.id);
    expect(result).toEqual({
      kind: "found",
      link: expect.objectContaining({
        id: detail.id,
        state: "active",
        sharePath: "/pay/abcdefghijklmnopqrstuvwx",
        lines: [expect.objectContaining({ quantity: 2, unitPrice: "9.9" })],
      }),
    });
  });

  it("shares one opaque unavailable outcome for malformed, missing, and cross-owner identities", async () => {
    const { store, findForOwner } = createStore();
    const service = createPaymentLinkV2ViewService(store, now);
    await expect(service.getForOwner(merchant, "not-a-uuid")).resolves.toEqual({ kind: "unavailable" });
    await expect(service.getForOwner(merchant, stored().id)).resolves.toEqual({ kind: "unavailable" });
    expect(findForOwner).toHaveBeenCalledTimes(1);
  });

  it("requires an active merchant principal before any read", async () => {
    const { store, findForOwner } = createStore([], stored());
    const service = createPaymentLinkV2ViewService(store, now);
    await expect(service.getForOwner(administrator, stored().id)).rejects.toThrow();
    expect(findForOwner).not.toHaveBeenCalled();
  });
});

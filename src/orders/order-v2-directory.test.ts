import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDirectoryCursorCodec } from "../data-directory/server/cursor";
import {
  createOrderV2DirectoryService,
  type OrderV2DirectoryRead,
  type OrderV2DirectoryStore,
} from "./order-v2-directory";
import type { OrderV2Summary } from "./order-v2-view";

const ownerId = "110e8400-e29b-41d4-a716-446655440011";
const otherOwnerId = "220e8400-e29b-41d4-a716-446655440022";

const owner = { id: ownerId, username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const otherOwner = { ...owner, id: otherOwnerId };

const usdPair = {
  currencyUuid: "990e8400-e29b-41d4-a716-446655440099",
  exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa",
};

function summary(index: number): OrderV2Summary {
  const suffix = String(index).padStart(12, "0");
  return {
    id: `440e8400-e29b-41d4-a716-${suffix}`,
    source: "AD_HOC",
    paymentLinkV2Identifier: null,
    amount: "10.25",
    currencyUuid: usdPair.currencyUuid,
    exchangeCurrencyUuid: usdPair.exchangeCurrencyUuid,
    descriptionPtBr: "Doação",
    descriptionEn: "Donation",
    state: null,
    currentLocalOutcome: null,
    checkoutDataPolicy: "NAME_EMAIL",
    createdAt: new Date(Date.UTC(2026, 6, 25, 12, 0, 0) - index * 60_000),
    updatedAt: new Date(Date.UTC(2026, 6, 25, 12, 0, 0) - index * 60_000),
    settledAt: null,
  };
}

function storeWith(rows: readonly OrderV2Summary[], usd: OrderV2DirectoryStore["findActiveUsdPair"] = async () => usdPair) {
  const readWindow = vi.fn(async (_input: OrderV2DirectoryRead) => [...rows]);
  const store: OrderV2DirectoryStore = { findActiveUsdPair: vi.fn(usd), readWindow };
  return { store, readWindow };
}

function serviceWith(store: OrderV2DirectoryStore) {
  return createOrderV2DirectoryService({
    store,
    codec: createDirectoryCursorCodec(() => Buffer.alloc(32, 9)),
  });
}

describe("owner order V2 directory", () => {
  it("redirects noncanonical requests to the canonical location before any I/O", async () => {
    const { store, readWindow } = storeWith([]);
    const service = serviceWith(store);
    await expect(service.query(owner, "/orders?pageSize=20")).resolves.toEqual({
      status: "redirect",
      location: "/orders",
    });
    await expect(service.query(owner, "/orders?filter.source=LINK&q=Ana")).resolves.toEqual({
      status: "redirect",
      location: "/orders?q=Ana&filter.source=LINK",
    });
    expect(readWindow).not.toHaveBeenCalled();
    expect(store.findActiveUsdPair).not.toHaveBeenCalled();
  });

  it("resolves invalid input, sizes outside the registered set, and bad dates to zero-I/O invalid", async () => {
    const { store, readWindow } = storeWith([]);
    const service = serviceWith(store);
    for (const target of [
      "/orders?unknown=1",
      "/orders?pageSize=30",
      "/orders?pageSize=25",
      "/orders?q=a&q=b",
      "/orders?filter.from=2026-02-30",
      "/orders?filter.from=25-07-2026",
      "/orders?filter.to=2026-13-01",
      "/orders?filter.source=UNKNOWN",
    ]) {
      await expect(service.query(owner, target)).resolves.toEqual({ status: "invalid-query" });
    }
    expect(readWindow).not.toHaveBeenCalled();
    expect(store.findActiveUsdPair).not.toHaveBeenCalled();
  });

  it("reads a bounded owner-scoped first page with the registered default size", async () => {
    const rows = Array.from({ length: 21 }, (_, index) => summary(index + 1));
    const { store, readWindow } = storeWith(rows);
    const service = serviceWith(store);
    const result = await service.query(owner, "/orders");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.rows).toHaveLength(20);
    expect(result.pageSize).toBe(20);
    expect(result.nextCursor).toBeDefined();
    expect(result.previousCursor).toBeUndefined();
    expect(readWindow).toHaveBeenCalledTimes(1);
    const read = readWindow.mock.calls[0][0];
    expect(read.take).toBe(21);
    expect(read.ascending).toBe(false);
    expect(read.where).toEqual({ ownerId });
  });

  it("pages forward and backward through keyset seeks", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => summary(index + 1));
    const { store, readWindow } = storeWith(rows.slice(0, 21));
    const service = serviceWith(store);
    const first = await service.query(owner, "/orders");
    if (first.status !== "ready" || !first.nextCursor) throw new Error("expected a ready first page");

    readWindow.mockImplementation(async () => rows.slice(20, 41));
    const second = await service.query(owner, `/orders?cursor=${first.nextCursor}`);
    expect(second.status).toBe("ready");
    if (second.status !== "ready") return;
    expect(second.rows[0].id).toBe(rows[20].id);
    expect(second.nextCursor).toBeDefined();
    expect(second.previousCursor).toBeDefined();
    const forward = readWindow.mock.calls.at(-1)?.[0];
    expect(forward?.ascending).toBe(false);
    expect(forward?.where).toMatchObject({
      ownerId,
      AND: [{ OR: [
        { createdAt: { lt: rows[19].createdAt } },
        { createdAt: { equals: rows[19].createdAt }, id: { lt: rows[19].id } },
      ] }],
    });

    if (!second.previousCursor) throw new Error("expected a previous cursor");
    readWindow.mockImplementation(async () => rows.slice(0, 20).reverse());
    const back = await service.query(owner, `/orders?cursor=${second.previousCursor}`);
    expect(back.status).toBe("ready");
    if (back.status !== "ready") return;
    const backward = readWindow.mock.calls.at(-1)?.[0];
    expect(backward?.ascending).toBe(true);
    expect(backward?.where).toMatchObject({
      AND: [{ OR: [
        { createdAt: { gt: rows[20].createdAt } },
        { createdAt: { equals: rows[20].createdAt }, id: { gt: rows[20].id } },
      ] }],
    });
    expect(back.rows).toHaveLength(20);
    expect(back.rows[0].id).toBe(rows[0].id);
  });

  it("applies source, money, date, link, and both q modes inside the owner scope", async () => {
    const { store, readWindow } = storeWith([summary(1)]);
    const service = serviceWith(store);

    await service.query(owner, "/orders?filter.source=LINK");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toMatchObject({ ownerId, AND: [{ source: "LINK" }] });

    await service.query(owner, "/orders?filter.source=AD_HOC&filter.source=LINK");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ ownerId });

    await service.query(owner, "/orders?filter.money=USD");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toMatchObject({
      AND: [{ currencyUuid: usdPair.currencyUuid, exchangeCurrencyUuid: usdPair.exchangeCurrencyUuid }],
    });

    await service.query(owner, "/orders?filter.money=FIAT");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toMatchObject({
      AND: [{ NOT: { currencyUuid: usdPair.currencyUuid, exchangeCurrencyUuid: usdPair.exchangeCurrencyUuid } }],
    });

    await service.query(owner, "/orders?filter.from=2026-07-01&filter.to=2026-07-25");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toMatchObject({
      AND: [{ createdAt: { gte: new Date("2026-07-01T00:00:00.000Z"), lt: new Date("2026-07-26T00:00:00.000Z") } }],
    });

    await service.query(owner, "/orders?filter.link=AbCdEfGhIjKlMnOpQrStUvWx");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toMatchObject({
      AND: [{ paymentLink: { is: { identifier: "AbCdEfGhIjKlMnOpQrStUvWx" } } }],
    });

    await service.query(owner, `/orders?q=${otherOwnerId.toUpperCase()}`);
    expect(readWindow.mock.calls.at(-1)?.[0].where).toMatchObject({
      AND: [{ OR: [{ id: otherOwnerId }, { providerOrders: { some: { providerOrderUuid: otherOwnerId } } }] }],
    });

    await service.query(owner, "/orders?q=Ana");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toMatchObject({
      AND: [{ OR: [
        { name: { contains: "Ana", mode: "insensitive" } },
        { email: { contains: "Ana", mode: "insensitive" } },
        { cpf: { contains: "Ana", mode: "insensitive" } },
      ] }],
    });
    for (const call of readWindow.mock.calls) {
      expect(call[0].where.ownerId).toBe(ownerId);
    }
  });

  it("returns an empty page without order I/O when USD is filtered but no USD mapping is active", async () => {
    const { store, readWindow } = storeWith([summary(1)], async () => null);
    const service = serviceWith(store);
    const result = await service.query(owner, "/orders?filter.money=USD");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected a ready empty page");
    expect(result.rows).toEqual([]);
    expect(store.findActiveUsdPair).toHaveBeenCalled();
    expect(readWindow).not.toHaveBeenCalled();

    const fiat = await service.query(owner, "/orders?filter.money=FIAT");
    expect(fiat.status).toBe("ready");
    if (fiat.status !== "ready") throw new Error("expected a ready fiat page");
    expect(fiat.rows).toHaveLength(1);
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ ownerId });
  });

  it("resets a stale cursor and rejects a foreign cursor without I/O", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => summary(index + 1));
    const { store, readWindow } = storeWith(rows.slice(0, 51));
    const service = serviceWith(store);
    const sized = await service.query(owner, "/orders?pageSize=50");
    if (sized.status !== "ready" || !sized.nextCursor) throw new Error("expected a ready sized page");

    readWindow.mockClear();
    await expect(service.query(owner, `/orders?cursor=${sized.nextCursor}`)).resolves.toEqual({
      status: "redirect",
      location: "/orders",
    });
    expect(readWindow).not.toHaveBeenCalled();

    await expect(service.query(otherOwner, "/orders?pageSize=50")).resolves.toMatchObject({ status: "ready" });
    readWindow.mockClear();
    await expect(service.query(otherOwner, `/orders?pageSize=50&cursor=${sized.nextCursor}`)).resolves.toEqual({
      status: "invalid-query",
    });
    expect(readWindow).not.toHaveBeenCalled();
  });
});

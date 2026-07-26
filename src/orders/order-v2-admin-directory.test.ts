import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "../auth/authorization";
import { createDirectoryCursorCodec } from "../data-directory/server/cursor";
import { DirectoryAuthorizationError } from "../data-directory/server/directory-page";
import {
  createAdminOrderV2DirectoryService,
  type AdminOrderV2DirectoryRead,
  type AdminOrderV2DirectoryStore,
  type AdminOrderV2Owner,
  type AdminOrderV2Summary,
} from "./order-v2-admin-directory";
import type { OrderV2Summary } from "./order-v2-view";

const admin = { id: "110e8400-e29b-41d4-a716-446655440011", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const merchant = { ...admin, id: "220e8400-e29b-41d4-a716-446655440022", role: "USER" as const };
const otherAdmin = { ...admin, id: "330e8400-e29b-41d4-a716-446655440033", username: "admin.two" };

const usdPair = {
  currencyUuid: "990e8400-e29b-41d4-a716-446655440099",
  exchangeCurrencyUuid: "aa0e8400-e29b-41d4-a716-4466554400aa",
};

const ownerAttribution: AdminOrderV2Owner = { username: "merchant.one", deletedAt: null };

function summary(index: number, owner: AdminOrderV2Owner = ownerAttribution): AdminOrderV2Summary {
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
    payer: { name: null, email: null, cpf: null, address: null },
    createdAt: new Date(Date.UTC(2026, 6, 25, 12, 0, 0) - index * 60_000),
    updatedAt: new Date(Date.UTC(2026, 6, 25, 12, 0, 0) - index * 60_000),
    settledAt: null,
    owner,
  };
}

function storeWith(rows: readonly AdminOrderV2Summary[], usd: AdminOrderV2DirectoryStore["findActiveUsdPair"] = async () => usdPair) {
  const readWindow = vi.fn(async (_input: AdminOrderV2DirectoryRead) => [...rows]);
  const readOwnerAttribution = vi.fn<AdminOrderV2DirectoryStore["readOwnerAttribution"]>(async (_orderId: string) => ownerAttribution);
  const store: AdminOrderV2DirectoryStore = { findActiveUsdPair: vi.fn(usd), readWindow, readOwnerAttribution };
  return { store, readWindow, readOwnerAttribution };
}

const codecKey = () => Buffer.alloc(32, 9);

function serviceWith(store: AdminOrderV2DirectoryStore) {
  return createAdminOrderV2DirectoryService({
    store,
    codec: createDirectoryCursorCodec(codecKey),
  });
}

describe("administrator order V2 directory", () => {
  it("redirects noncanonical requests to the canonical location before any I/O", async () => {
    const { store, readWindow } = storeWith([]);
    const service = serviceWith(store);
    await expect(service.query(admin, "/admin/orders?pageSize=50")).resolves.toEqual({
      status: "redirect",
      location: "/admin/orders",
    });
    await expect(service.query(admin, "/admin/orders?filter.source=LINK&q=Ana")).resolves.toEqual({
      status: "redirect",
      location: "/admin/orders?q=Ana&filter.source=LINK",
    });
    expect(readWindow).not.toHaveBeenCalled();
    expect(store.findActiveUsdPair).not.toHaveBeenCalled();
  });

  it("resolves invalid input, sizes outside the registered set, and bad dates to zero-I/O invalid", async () => {
    const { store, readWindow } = storeWith([]);
    const service = serviceWith(store);
    for (const target of [
      "/admin/orders?unknown=1",
      "/admin/orders?pageSize=30",
      "/admin/orders?pageSize=25",
      "/admin/orders?q=a&q=b",
      "/admin/orders?filter.from=2026-02-30",
      "/admin/orders?filter.from=25-07-2026",
      "/admin/orders?filter.to=2026-13-01",
      "/admin/orders?filter.source=UNKNOWN",
    ]) {
      await expect(service.query(admin, target)).resolves.toEqual({ status: "invalid-query" });
    }
    expect(readWindow).not.toHaveBeenCalled();
    expect(store.findActiveUsdPair).not.toHaveBeenCalled();
  });

  it("reads a bounded administrator-global first page with the registered default size", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => summary(index + 1));
    const { store, readWindow } = storeWith(rows);
    const service = serviceWith(store);
    const result = await service.query(admin, "/admin/orders");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.rows).toHaveLength(50);
    expect(result.pageSize).toBe(50);
    expect(result.nextCursor).toBeDefined();
    expect(result.previousCursor).toBeUndefined();
    expect(readWindow).toHaveBeenCalledTimes(1);
    const read = readWindow.mock.calls[0][0];
    expect(read.take).toBe(51);
    expect(read.ascending).toBe(false);
    expect(read.where).toEqual({});
  });

  it("carries only the summary projection plus the owner attribution tuple on each row", async () => {
    const { store } = storeWith([summary(1, { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") })]);
    const service = serviceWith(store);
    const result = await service.query(admin, "/admin/orders");
    if (result.status !== "ready") throw new Error("expected a ready page");
    expect(Object.keys(result.rows[0]).sort()).toEqual([
      "amount",
      "checkoutDataPolicy",
      "createdAt",
      "currencyUuid",
      "currentLocalOutcome",
      "descriptionEn",
      "descriptionPtBr",
      "exchangeCurrencyUuid",
      "id",
      "owner",
      "payer",
      "paymentLinkV2Identifier",
      "settledAt",
      "source",
      "state",
      "updatedAt",
    ].sort());
    expect(Object.keys(result.rows[0].owner).sort()).toEqual(["deletedAt", "username"]);
    expect(result.rows[0].owner).toEqual({ username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") });
  });

  it("pages forward and backward through keyset seeks without an owner scope", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => summary(index + 1));
    const { store, readWindow } = storeWith(rows.slice(0, 51));
    const service = serviceWith(store);
    const first = await service.query(admin, "/admin/orders");
    if (first.status !== "ready" || !first.nextCursor) throw new Error("expected a ready first page");

    readWindow.mockImplementation(async () => rows.slice(50, 60));
    const second = await service.query(admin, `/admin/orders?cursor=${first.nextCursor}`);
    expect(second.status).toBe("ready");
    if (second.status !== "ready") return;
    expect(second.rows[0].id).toBe(rows[50].id);
    expect(second.nextCursor).toBeUndefined();
    expect(second.previousCursor).toBeDefined();
    const forward = readWindow.mock.calls.at(-1)?.[0];
    expect(forward?.ascending).toBe(false);
    expect(forward?.where).toEqual({
      AND: [{ OR: [
        { createdAt: { lt: rows[49].createdAt } },
        { createdAt: { equals: rows[49].createdAt }, id: { lt: rows[49].id } },
      ] }],
    });

    if (!second.previousCursor) throw new Error("expected a previous cursor");
    readWindow.mockImplementation(async () => rows.slice(0, 50).reverse());
    const back = await service.query(admin, `/admin/orders?cursor=${second.previousCursor}`);
    expect(back.status).toBe("ready");
    const backward = readWindow.mock.calls.at(-1)?.[0];
    expect(backward?.ascending).toBe(true);
    expect(backward?.where).toEqual({
      AND: [{ OR: [
        { createdAt: { gt: rows[50].createdAt } },
        { createdAt: { equals: rows[50].createdAt }, id: { gt: rows[50].id } },
      ] }],
    });
    if (back.status !== "ready") return;
    expect(back.rows).toHaveLength(50);
    expect(back.rows[0].id).toBe(rows[0].id);
  });

  it("applies source, money, date, link, and both q modes in the global scope", async () => {
    const { store, readWindow } = storeWith([summary(1)]);
    const service = serviceWith(store);

    await service.query(admin, "/admin/orders?filter.source=LINK");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ source: "LINK" }] });

    await service.query(admin, "/admin/orders?filter.source=STANDALONE");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ source: "STANDALONE" }] });

    await service.query(admin, "/admin/orders?filter.source=AD_HOC&filter.source=LINK");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({});

    await service.query(admin, "/admin/orders?filter.money=USD");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ currencyUuid: usdPair.currencyUuid, exchangeCurrencyUuid: usdPair.exchangeCurrencyUuid }],
    });

    await service.query(admin, "/admin/orders?filter.money=FIAT");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ NOT: { currencyUuid: usdPair.currencyUuid, exchangeCurrencyUuid: usdPair.exchangeCurrencyUuid } }],
    });

    await service.query(admin, "/admin/orders?filter.from=2026-07-01&filter.to=2026-07-25");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ createdAt: { gte: new Date("2026-07-01T00:00:00.000Z"), lt: new Date("2026-07-26T00:00:00.000Z") } }],
    });

    await service.query(admin, "/admin/orders?filter.link=AbCdEfGhIjKlMnOpQrStUvWx");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ paymentLink: { is: { identifier: "AbCdEfGhIjKlMnOpQrStUvWx" } } }],
    });

    const providerUuid = "550e8400-e29b-41d4-a716-446655440055";
    await service.query(admin, `/admin/orders?q=${providerUuid.toUpperCase()}`);
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ OR: [{ id: providerUuid }, { providerOrders: { some: { providerOrderUuid: providerUuid } } }] }],
    });

    await service.query(admin, "/admin/orders?q=Ana");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ OR: [
        { name: { contains: "Ana", mode: "insensitive" } },
        { email: { contains: "Ana", mode: "insensitive" } },
        { cpf: { contains: "Ana", mode: "insensitive" } },
      ] }],
    });
    for (const call of readWindow.mock.calls) {
      expect(call[0].where).not.toHaveProperty("ownerId");
    }
  });

  it("returns an empty page without order I/O when USD is filtered but no USD mapping is active", async () => {
    const { store, readWindow } = storeWith([summary(1)], async () => null);
    const service = serviceWith(store);
    const result = await service.query(admin, "/admin/orders?filter.money=USD");
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected a ready empty page");
    expect(result.rows).toEqual([]);
    expect(store.findActiveUsdPair).toHaveBeenCalled();
    expect(readWindow).not.toHaveBeenCalled();

    const fiat = await service.query(admin, "/admin/orders?filter.money=FIAT");
    expect(fiat.status).toBe("ready");
    if (fiat.status !== "ready") throw new Error("expected a ready fiat page");
    expect(fiat.rows).toHaveLength(1);
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({});
  });

  it("resets a stale cursor without I/O", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => summary(index + 1));
    const { store, readWindow } = storeWith(rows.slice(0, 101));
    const service = serviceWith(store);
    const sized = await service.query(admin, "/admin/orders?pageSize=100");
    if (sized.status !== "ready" || !sized.nextCursor) throw new Error("expected a ready sized page");

    readWindow.mockClear();
    await expect(service.query(admin, `/admin/orders?cursor=${sized.nextCursor}`)).resolves.toEqual({
      status: "redirect",
      location: "/admin/orders",
    });
    expect(readWindow).not.toHaveBeenCalled();

    // Administrator-global cursors are purpose-bound, not principal-bound
    // (the delivered foundation derives no per-administrator key), so the same
    // cursor remains valid for another administrator.
    await expect(service.query(otherAdmin, "/admin/orders?pageSize=100")).resolves.toMatchObject({ status: "ready" });
    await expect(service.query(otherAdmin, `/admin/orders?pageSize=100&cursor=${sized.nextCursor}`)).resolves.toMatchObject({
      status: "ready",
    });
  });

  it("rejects a cursor minted for another directory without I/O", async () => {
    const { store, readWindow } = storeWith([summary(1)]);
    const service = serviceWith(store);
    const codec = createDirectoryCursorCodec(codecKey);
    const foreignCursor = codec.encode(
      {
        directory: "owner-order-v2",
        scopePurpose: "ADMIN_GLOBAL",
        principalId: admin.id,
        size: 50,
        canonicalFilterQuery: "",
        orderId: "created-at-id-desc",
      },
      "forward",
      [Date.UTC(2026, 6, 25, 12, 0, 0), "440e8400-e29b-41d4-a716-000000000001"],
    );
    await expect(service.query(admin, `/admin/orders?cursor=${foreignCursor}`)).resolves.toEqual({
      status: "invalid-query",
    });
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("rejects a cursor bound to the merchant-own scope purpose without I/O", async () => {
    const { store, readWindow } = storeWith([summary(1)]);
    const service = serviceWith(store);
    const merchantCodec = createDirectoryCursorCodec(codecKey);
    const foreignCursor = merchantCodec.encode(
      {
        directory: "admin-order-v2",
        scopePurpose: "MERCHANT_OWN",
        principalId: merchant.id,
        size: 50,
        canonicalFilterQuery: "",
        orderId: "created-at-id-desc",
      },
      "forward",
      [Date.UTC(2026, 6, 25, 12, 0, 0), "440e8400-e29b-41d4-a716-000000000001"],
    );
    await expect(service.query(admin, `/admin/orders?cursor=${foreignCursor}`)).resolves.toEqual({
      status: "invalid-query",
    });
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("denies every read to non-administrator principals before any I/O", async () => {
    const { store, readWindow } = storeWith([summary(1)]);
    const service = serviceWith(store);
    await expect(service.query(merchant, "/admin/orders")).rejects.toBeInstanceOf(DirectoryAuthorizationError);
    await expect(service.readOwnerAttribution(merchant, "440e8400-e29b-41d4-a716-000000000001")).rejects.toBeInstanceOf(ForbiddenError);
    const disabledAdmin = { ...admin, status: "DISABLED" as const };
    await expect(service.query(disabledAdmin, "/admin/orders")).rejects.toBeInstanceOf(DirectoryAuthorizationError);
    await expect(service.readOwnerAttribution(disabledAdmin, "440e8400-e29b-41d4-a716-000000000001")).rejects.toBeInstanceOf(ForbiddenError);
    expect(readWindow).not.toHaveBeenCalled();
    expect(store.readOwnerAttribution).not.toHaveBeenCalled();
  });

  it("reads owner attribution only for a well-formed order identity", async () => {
    const { store, readOwnerAttribution } = storeWith([]);
    const service = serviceWith(store);
    await expect(service.readOwnerAttribution(admin, "440E8400-E29B-41D4-A716-000000000001")).resolves.toEqual(ownerAttribution);
    expect(readOwnerAttribution).toHaveBeenCalledWith("440e8400-e29b-41d4-a716-000000000001");
    await expect(service.readOwnerAttribution(admin, "not-an-order")).resolves.toBeNull();
    await expect(service.readOwnerAttribution(admin, 42)).resolves.toBeNull();
    expect(readOwnerAttribution).toHaveBeenCalledTimes(1);

    readOwnerAttribution.mockResolvedValueOnce(null);
    await expect(service.readOwnerAttribution(admin, "440e8400-e29b-41d4-a716-000000000099")).resolves.toBeNull();
  });
});

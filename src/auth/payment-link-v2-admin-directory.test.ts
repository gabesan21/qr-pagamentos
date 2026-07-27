import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDirectoryCursorCodec } from "../data-directory/server/cursor";
import { DirectoryAuthorizationError } from "../data-directory/server/directory-page";
import { ForbiddenError } from "./authorization";
import {
  createAdminPaymentLinkV2DirectoryService,
  type AdminPaymentLinkV2DirectoryRead,
  type AdminPaymentLinkV2DirectoryStore,
  type AdminPaymentLinkV2Owner,
  type AdminStoredPaymentLinkV2,
} from "./payment-link-v2-admin-directory";
import {
  derivePaymentLinkV2State,
  PAYMENT_LINK_V2_DERIVED_STATES,
  type PaymentLinkV2DerivedState,
} from "./payment-link-v2-view";

const NOW = new Date("2026-07-25T12:00:00.000Z");

const admin = { id: "110e8400-e29b-41d4-a716-446655440011", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const merchant = { ...admin, id: "220e8400-e29b-41d4-a716-446655440022", role: "USER" as const };
const otherAdmin = { ...admin, id: "330e8400-e29b-41d4-a716-446655440033", username: "admin.two" };

const ownerAttribution: AdminPaymentLinkV2Owner = { username: "merchant.one", deletedAt: null };

function storedLink(index: number, owner: AdminPaymentLinkV2Owner = ownerAttribution): AdminStoredPaymentLinkV2 {
  const suffix = String(index).padStart(12, "0");
  return {
    link: {
      id: `440e8400-e29b-41d4-a716-${suffix}`,
      identifier: `identifier${String(index).padStart(18, "0")}`.slice(0, 24),
      compositionKind: "FIXED_AMOUNT",
      descriptionPtBr: "Doação",
      descriptionEn: "Donation",
      amount: "10.50",
      currencyPairLabel: "BRL/USDT",
      linkType: "REUSABLE",
      expiresAt: null,
      active: true,
      paid: false,
      orderCount: 0,
      createdAt: new Date(NOW.getTime() - index * 60_000),
      updatedAt: new Date(NOW.getTime() - index * 60_000),
      lines: [],
    },
    owner,
  };
}

function storeWith(rows: readonly AdminStoredPaymentLinkV2[]) {
  const readWindow = vi.fn(async (_input: AdminPaymentLinkV2DirectoryRead) => [...rows]);
  const findForAdmin = vi.fn<AdminPaymentLinkV2DirectoryStore["findForAdmin"]>(async (_id: string) => rows[0] ?? null);
  const store: AdminPaymentLinkV2DirectoryStore = { readWindow, findForAdmin };
  return { store, readWindow, findForAdmin };
}

const codecKey = () => Buffer.alloc(32, 9);

function serviceWith(store: AdminPaymentLinkV2DirectoryStore) {
  return createAdminPaymentLinkV2DirectoryService({
    store,
    codec: createDirectoryCursorCodec(codecKey),
    now: () => NOW,
  });
}

// A fail-closed evaluator for exactly the where-fragment vocabulary the
// derived-state mirror emits; anything else throws, so drift fails loudly.
type ConditionRow = Readonly<{
  active: boolean;
  expiresAt: Date | null;
  linkType: "SINGLE_USE" | "REUSABLE";
  singleUseSettlement: Readonly<{ paymentLinkV2Id: string }> | null;
  orders: readonly Readonly<{ source: string; state: string }>[];
}>;

function matchesCondition(row: ConditionRow, where: Record<string, unknown>): boolean {
  const entries = Object.entries(where);
  return entries.every(([key, value]) => {
    if (key === "AND") return (value as Record<string, unknown>[]).every((entry) => matchesCondition(row, entry));
    if (key === "OR") return (value as Record<string, unknown>[]).some((entry) => matchesCondition(row, entry));
    if (key === "NOT") return !matchesCondition(row, value as Record<string, unknown>);
    if (key === "active") return row.active === value;
    if (key === "linkType") return row.linkType === value;
    if (key === "expiresAt") {
      if (value === null) return row.expiresAt === null;
      const filter = value as { lte?: Date; gt?: Date };
      if (row.expiresAt === null) return false;
      if (filter.lte !== undefined) return row.expiresAt.getTime() <= filter.lte.getTime();
      if (filter.gt !== undefined) return row.expiresAt.getTime() > filter.gt.getTime();
      throw new Error("unsupported expiresAt filter");
    }
    if (key === "singleUseSettlement") {
      const filter = value as { isNot: null };
      if (filter.isNot !== null) throw new Error("unsupported singleUseSettlement filter");
      return row.singleUseSettlement !== null;
    }
    if (key === "orders") {
      const filter = value as { some: { source: string; state: string } };
      return row.orders.some((order) => order.source === filter.some.source && order.state === filter.some.state);
    }
    throw new Error(`unsupported where key: ${key}`);
  });
}

describe("administrator payment-link V2 directory", () => {
  it("redirects noncanonical requests to the canonical location before any I/O", async () => {
    const { store, readWindow } = storeWith([]);
    const service = serviceWith(store);
    await expect(service.query(admin, "/admin/payment-links?pageSize=50")).resolves.toEqual({
      status: "redirect",
      location: "/admin/payment-links",
    });
    await expect(service.query(admin, "/admin/payment-links?filter.type=SINGLE_USE&q=Ana")).resolves.toEqual({
      status: "redirect",
      location: "/admin/payment-links?q=Ana&filter.type=SINGLE_USE",
    });
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("resolves invalid input, sizes outside the registered set, and bad dates to zero-I/O invalid", async () => {
    const { store, readWindow } = storeWith([]);
    const service = serviceWith(store);
    for (const target of [
      "/admin/payment-links?unknown=1",
      "/admin/payment-links?pageSize=25",
      "/admin/payment-links?pageSize=30",
      "/admin/payment-links?q=a&q=b",
      "/admin/payment-links?filter.from=2026-02-30",
      "/admin/payment-links?filter.from=25-07-2026",
      "/admin/payment-links?filter.to=2026-13-01",
      "/admin/payment-links?filter.state=UNKNOWN",
    ]) {
      await expect(service.query(admin, target)).resolves.toEqual({ status: "invalid-query" });
    }
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("reads a bounded administrator-global first page with the registered default size", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => storedLink(index + 1));
    const { store, readWindow } = storeWith(rows);
    const service = serviceWith(store);
    const result = await service.query(admin, "/admin/payment-links");
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

  it("carries only the owner directory projection plus the owner attribution tuple on each row", async () => {
    const { store } = storeWith([storedLink(1, { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") })]);
    const service = serviceWith(store);
    const result = await service.query(admin, "/admin/payment-links");
    if (result.status !== "ready") throw new Error("expected a ready page");
    expect(Object.keys(result.rows[0]).sort()).toEqual([
      "active",
      "amount",
      "compositionKind",
      "createdAt",
      "currencyPairLabel",
      "descriptionEn",
      "descriptionPtBr",
      "expiresAt",
      "id",
      "identifier",
      "lines",
      "linkType",
      "orderCount",
      "owner",
      "paid",
      "sharePath",
      "state",
      "updatedAt",
    ].sort());
    expect(Object.keys(result.rows[0].owner).sort()).toEqual(["deletedAt", "username"]);
    expect(result.rows[0].owner).toEqual({ username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") });
  });

  it("pages forward and backward through keyset seeks without an owner scope", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => storedLink(index + 1));
    const { store, readWindow } = storeWith(rows.slice(0, 51));
    const service = serviceWith(store);
    const first = await service.query(admin, "/admin/payment-links");
    if (first.status !== "ready" || !first.nextCursor) throw new Error("expected a ready first page");

    readWindow.mockImplementation(async () => rows.slice(50, 60));
    const second = await service.query(admin, `/admin/payment-links?cursor=${first.nextCursor}`);
    expect(second.status).toBe("ready");
    if (second.status !== "ready") return;
    expect(second.rows[0].id).toBe(rows[50].link.id);
    expect(second.nextCursor).toBeUndefined();
    expect(second.previousCursor).toBeDefined();
    const forward = readWindow.mock.calls.at(-1)?.[0];
    expect(forward?.ascending).toBe(false);
    expect(forward?.where).toEqual({
      AND: [{ OR: [
        { createdAt: { lt: rows[49].link.createdAt } },
        { createdAt: { equals: rows[49].link.createdAt }, id: { lt: rows[49].link.id } },
      ] }],
    });

    if (!second.previousCursor) throw new Error("expected a previous cursor");
    readWindow.mockImplementation(async () => rows.slice(0, 50).reverse());
    const back = await service.query(admin, `/admin/payment-links?cursor=${second.previousCursor}`);
    expect(back.status).toBe("ready");
    const backward = readWindow.mock.calls.at(-1)?.[0];
    expect(backward?.ascending).toBe(true);
    expect(backward?.where).toEqual({
      AND: [{ OR: [
        { createdAt: { gt: rows[50].link.createdAt } },
        { createdAt: { equals: rows[50].link.createdAt }, id: { gt: rows[50].link.id } },
      ] }],
    });
    if (back.status !== "ready") return;
    expect(back.rows).toHaveLength(50);
    expect(back.rows[0].id).toBe(rows[0].link.id);
  });

  it("applies type, kind, date, and both q modes in the global scope", async () => {
    const { store, readWindow } = storeWith([storedLink(1)]);
    const service = serviceWith(store);

    await service.query(admin, "/admin/payment-links?filter.type=SINGLE_USE");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ linkType: { in: ["SINGLE_USE"] } }] });

    await service.query(admin, "/admin/payment-links?filter.type=REUSABLE&filter.type=SINGLE_USE");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ linkType: { in: ["REUSABLE", "SINGLE_USE"] } }] });

    await service.query(admin, "/admin/payment-links?filter.kind=PRODUCT_LINES");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ compositionKind: { in: ["PRODUCT_LINES"] } }] });

    await service.query(admin, "/admin/payment-links?filter.from=2026-07-01&filter.to=2026-07-25");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ createdAt: { gte: new Date("2026-07-01T00:00:00.000Z"), lt: new Date("2026-07-26T00:00:00.000Z") } }],
    });

    const identifier = "AbCdEfGhIjKlMnOpQrStUvWx";
    await service.query(admin, `/admin/payment-links?q=${identifier}`);
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ identifier }] });

    await service.query(admin, "/admin/payment-links?q=Ana");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ OR: [
        { descriptionPtBr: { contains: "Ana", mode: "insensitive" } },
        { descriptionEn: { contains: "Ana", mode: "insensitive" } },
        { owner: { is: { username: { contains: "Ana", mode: "insensitive" } } } },
      ] }],
    });
    for (const call of readWindow.mock.calls) {
      expect(call[0].where).not.toHaveProperty("ownerId");
    }
  });

  it("keeps every derived-state filter in exact agreement with derivePaymentLinkV2State", async () => {
    const past = new Date(NOW.getTime() - 60_000);
    const future = new Date(NOW.getTime() + 60_000);
    const rows: ConditionRow[] = [];
    for (const linkType of ["SINGLE_USE", "REUSABLE"] as const) {
      for (const active of [true, false]) {
        for (const expiresAt of [null, past, future] as (Date | null)[]) {
          for (const paid of [false, true]) {
            rows.push({
              active,
              expiresAt,
              linkType,
              singleUseSettlement: linkType === "SINGLE_USE" && paid ? { paymentLinkV2Id: "x" } : null,
              orders: linkType === "REUSABLE" && paid ? [{ source: "LINK", state: "CONFIRMED" }] : [],
            });
          }
        }
      }
    }
    // A pending LINK order never counts toward the confirmed paid signal.
    rows.push({
      active: true,
      expiresAt: null,
      linkType: "REUSABLE",
      singleUseSettlement: null,
      orders: [{ source: "LINK", state: "PENDING" }],
    });

    const { store, readWindow } = storeWith([storedLink(1)]);
    const service = serviceWith(store);
    for (const state of PAYMENT_LINK_V2_DERIVED_STATES) {
      await service.query(admin, `/admin/payment-links?filter.state=${state}`);
      const where = readWindow.mock.calls.at(-1)?.[0].where as { AND: Record<string, unknown>[] };
      expect(where.AND).toHaveLength(1);
      const condition = where.AND[0];
      for (const row of rows) {
        const confirmedPaid = row.singleUseSettlement !== null
          || row.orders.some((order) => order.source === "LINK" && order.state === "CONFIRMED");
        const derived: PaymentLinkV2DerivedState = derivePaymentLinkV2State(
          { active: row.active, expiresAt: row.expiresAt, paid: confirmedPaid },
          NOW,
        );
        expect(matchesCondition(row, condition), `state=${state} row=${JSON.stringify(row)}`).toBe(derived === state);
      }
    }
  });

  it("combines a state selection with the remaining filters under one AND", async () => {
    const { store, readWindow } = storeWith([storedLink(1)]);
    const service = serviceWith(store);
    await service.query(admin, "/admin/payment-links?filter.state=inactive&filter.type=REUSABLE");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ linkType: { in: ["REUSABLE"] } }, { OR: [{ active: false }] }],
    });
  });

  it("resets a stale cursor without I/O", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => storedLink(index + 1));
    const { store, readWindow } = storeWith(rows.slice(0, 101));
    const service = serviceWith(store);
    const sized = await service.query(admin, "/admin/payment-links?pageSize=100");
    if (sized.status !== "ready" || !sized.nextCursor) throw new Error("expected a ready sized page");

    readWindow.mockClear();
    await expect(service.query(admin, `/admin/payment-links?cursor=${sized.nextCursor}`)).resolves.toEqual({
      status: "redirect",
      location: "/admin/payment-links",
    });
    expect(readWindow).not.toHaveBeenCalled();

    // Administrator-global cursors are purpose-bound, not principal-bound (the
    // delivered foundation derives no per-administrator key), so the same
    // cursor remains valid for another administrator.
    await expect(service.query(otherAdmin, "/admin/payment-links?pageSize=100")).resolves.toMatchObject({ status: "ready" });
    await expect(service.query(otherAdmin, `/admin/payment-links?pageSize=100&cursor=${sized.nextCursor}`)).resolves.toMatchObject({
      status: "ready",
    });
  });

  it("rejects a cursor minted for another directory or scope purpose without I/O", async () => {
    const { store, readWindow } = storeWith([storedLink(1)]);
    const service = serviceWith(store);
    const codec = createDirectoryCursorCodec(codecKey);
    const tuple = [Date.UTC(2026, 6, 25, 12, 0, 0), "440e8400-e29b-41d4-a716-000000000001"] as const;
    const foreignDirectory = codec.encode(
      {
        directory: "merchant-payment-links-v2",
        scopePurpose: "ADMIN_GLOBAL",
        principalId: admin.id,
        size: 50,
        canonicalFilterQuery: "",
        orderId: "created-at-id-desc",
      },
      "forward",
      [...tuple],
    );
    await expect(service.query(admin, `/admin/payment-links?cursor=${foreignDirectory}`)).resolves.toEqual({
      status: "invalid-query",
    });
    const foreignPurpose = codec.encode(
      {
        directory: "admin-payment-links-v2",
        scopePurpose: "MERCHANT_OWN",
        principalId: merchant.id,
        size: 50,
        canonicalFilterQuery: "",
        orderId: "created-at-id-desc",
      },
      "forward",
      [...tuple],
    );
    await expect(service.query(admin, `/admin/payment-links?cursor=${foreignPurpose}`)).resolves.toEqual({
      status: "invalid-query",
    });
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("denies every read to non-administrator principals before any I/O", async () => {
    const { store, readWindow, findForAdmin } = storeWith([storedLink(1)]);
    const service = serviceWith(store);
    await expect(service.query(merchant, "/admin/payment-links")).rejects.toBeInstanceOf(DirectoryAuthorizationError);
    await expect(service.getForAdmin(merchant, "440e8400-e29b-41d4-a716-000000000001")).rejects.toBeInstanceOf(ForbiddenError);
    const disabledAdmin = { ...admin, status: "DISABLED" as const };
    await expect(service.query(disabledAdmin, "/admin/payment-links")).rejects.toBeInstanceOf(DirectoryAuthorizationError);
    await expect(service.getForAdmin(disabledAdmin, "440e8400-e29b-41d4-a716-000000000001")).rejects.toBeInstanceOf(ForbiddenError);
    expect(readWindow).not.toHaveBeenCalled();
    expect(findForAdmin).not.toHaveBeenCalled();
  });

  it("resolves the bounded detail read with the one opaque unavailable outcome", async () => {
    const { store, findForAdmin } = storeWith([storedLink(1, { username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") })]);
    const service = serviceWith(store);
    const found = await service.getForAdmin(admin, "440E8400-E29B-41D4-A716-000000000001");
    expect(findForAdmin).toHaveBeenCalledWith("440e8400-e29b-41d4-a716-000000000001");
    if (found.kind !== "found") throw new Error("expected a found detail");
    expect(found.link.id).toBe("440e8400-e29b-41d4-a716-000000000001");
    expect(found.link.state).toBe("active");
    expect(found.link.sharePath).toBe(`/pay/${found.link.identifier}`);
    expect(found.link.owner).toEqual({ username: "gone.owner", deletedAt: new Date("2026-07-20T00:00:00.000Z") });

    findForAdmin.mockClear();
    await expect(service.getForAdmin(admin, "not-a-link")).resolves.toEqual({ kind: "unavailable" });
    await expect(service.getForAdmin(admin, 42)).resolves.toEqual({ kind: "unavailable" });
    expect(findForAdmin).not.toHaveBeenCalled();

    findForAdmin.mockResolvedValueOnce(null);
    await expect(service.getForAdmin(admin, "440e8400-e29b-41d4-a716-000000000099")).resolves.toEqual({ kind: "unavailable" });
  });
});

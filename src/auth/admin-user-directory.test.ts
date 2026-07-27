import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "../auth/authorization";
import { createDirectoryCursorCodec } from "../data-directory/server/cursor";
import { DirectoryAuthorizationError } from "../data-directory/server/directory-page";
import {
  createAdminUserDirectoryService,
  deriveAdminUserDirectoryState,
  deriveAdminUserStoreState,
  type AdminUserDirectoryRead,
  type AdminUserDirectoryStore,
  type AdminUserDetail,
  type AdminUserSummary,
} from "./admin-user-directory";

const admin = { id: "110e8400-e29b-41d4-a716-446655440011", username: "admin", email: null, role: "ADMIN" as const, status: "ACTIVE" as const, createdAt: new Date() };
const merchant = { ...admin, id: "220e8400-e29b-41d4-a716-446655440022", role: "USER" as const };
const otherAdmin = { ...admin, id: "330e8400-e29b-41d4-a716-446655440033", username: "admin.two" };

function summary(index: number, overrides: Partial<AdminUserSummary> = {}): AdminUserSummary {
  const suffix = String(index).padStart(12, "0");
  return {
    id: `440e8400-e29b-41d4-a716-${suffix}`,
    username: `merchant.${index}`,
    email: `merchant.${index}@example.com`,
    role: "USER",
    status: "ACTIVE",
    createdAt: new Date(Date.UTC(2026, 6, 25, 12, 0, 0) - index * 60_000),
    deletedAt: null,
    state: "active",
    storeState: "none",
    lastActivityAt: null,
    ...overrides,
  };
}

function detail(index: number, overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return { ...summary(index), storefrontSlug: `store-${index}`, ...overrides };
}

function storeWith(rows: readonly AdminUserSummary[], detailRow: AdminUserDetail | null = detail(1)) {
  const readWindow = vi.fn(async (_input: AdminUserDirectoryRead) => [...rows]);
  const readDetail = vi.fn<AdminUserDirectoryStore["readDetail"]>(async (_userId: string) => detailRow);
  const store: AdminUserDirectoryStore = { readWindow, readDetail };
  return { store, readWindow, readDetail };
}

const codecKey = () => Buffer.alloc(32, 9);

function serviceWith(store: AdminUserDirectoryStore) {
  return createAdminUserDirectoryService({
    store,
    codec: createDirectoryCursorCodec(codecKey),
  });
}

describe("administrator user directory derived facts", () => {
  it("derives the render state as deleted over disabled over active", () => {
    expect(deriveAdminUserDirectoryState({ status: "ACTIVE", deletedAt: null })).toBe("active");
    expect(deriveAdminUserDirectoryState({ status: "DISABLED", deletedAt: null })).toBe("disabled");
    expect(deriveAdminUserDirectoryState({ status: "DISABLED", deletedAt: new Date() })).toBe("deleted");
    expect(deriveAdminUserDirectoryState({ status: "ACTIVE", deletedAt: new Date() })).toBe("deleted");
  });

  it("derives the store state from the slug and the enabled flag only", () => {
    expect(deriveAdminUserStoreState({ storefrontSlug: null, storefrontEnabled: false })).toBe("none");
    expect(deriveAdminUserStoreState({ storefrontSlug: null, storefrontEnabled: true })).toBe("none");
    expect(deriveAdminUserStoreState({ storefrontSlug: "store", storefrontEnabled: false })).toBe("configured");
    expect(deriveAdminUserStoreState({ storefrontSlug: "store", storefrontEnabled: true })).toBe("active");
  });
});

describe("administrator user directory", () => {
  it("redirects noncanonical requests to the canonical location before any I/O", async () => {
    const { store, readWindow } = storeWith([]);
    const service = serviceWith(store);
    await expect(service.query(admin, "/admin/accounts?pageSize=50")).resolves.toEqual({
      status: "redirect",
      location: "/admin/accounts",
    });
    await expect(service.query(admin, "/admin/accounts?filter.role=USER&q=Ana")).resolves.toEqual({
      status: "redirect",
      location: "/admin/accounts?q=Ana&filter.role=USER",
    });
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("resolves invalid input, sizes outside the registered set, and bad dates to zero-I/O invalid", async () => {
    const { store, readWindow } = storeWith([]);
    const service = serviceWith(store);
    for (const target of [
      "/admin/accounts?unknown=1",
      "/admin/accounts?pageSize=30",
      "/admin/accounts?pageSize=25",
      "/admin/accounts?q=a&q=b",
      "/admin/accounts?filter.from=2026-02-30",
      "/admin/accounts?filter.from=25-07-2026",
      "/admin/accounts?filter.to=2026-13-01",
      "/admin/accounts?filter.role=UNKNOWN",
      "/admin/accounts?filter.state=UNKNOWN",
    ]) {
      await expect(service.query(admin, target)).resolves.toEqual({ status: "invalid-query" });
    }
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("reads a bounded administrator-global first page with the registered default size", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => summary(index + 1));
    const { store, readWindow } = storeWith(rows);
    const service = serviceWith(store);
    const result = await service.query(admin, "/admin/accounts");
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

  it("carries only the administrator DTO plus the derived state, store, and activity facts", async () => {
    const deletedAt = new Date("2026-07-20T00:00:00.000Z");
    const { store } = storeWith([summary(1, { deletedAt, state: "deleted", storeState: "configured", lastActivityAt: new Date("2026-07-24T00:00:00.000Z") })]);
    const service = serviceWith(store);
    const result = await service.query(admin, "/admin/accounts");
    if (result.status !== "ready") throw new Error("expected a ready page");
    expect(Object.keys(result.rows[0]).sort()).toEqual([
      "createdAt",
      "deletedAt",
      "email",
      "id",
      "lastActivityAt",
      "role",
      "state",
      "status",
      "storeState",
      "username",
    ].sort());
    expect(result.rows[0]).not.toHaveProperty("storefrontSlug");
    expect(result.rows[0].deletedAt).toEqual(deletedAt);
  });

  it("pages forward and backward through keyset seeks", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => summary(index + 1));
    const { store, readWindow } = storeWith(rows.slice(0, 51));
    const service = serviceWith(store);
    const first = await service.query(admin, "/admin/accounts");
    if (first.status !== "ready" || !first.nextCursor) throw new Error("expected a ready first page");

    readWindow.mockImplementation(async () => rows.slice(50, 60));
    const second = await service.query(admin, `/admin/accounts?cursor=${first.nextCursor}`);
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
    const back = await service.query(admin, `/admin/accounts?cursor=${second.previousCursor}`);
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

  it("applies role, derived-state, date, and q filters in the global scope", async () => {
    const { store, readWindow } = storeWith([summary(1)]);
    const service = serviceWith(store);

    await service.query(admin, "/admin/accounts?filter.role=ADMIN");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ role: "ADMIN" }] });

    await service.query(admin, "/admin/accounts?filter.role=ADMIN&filter.role=USER");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({});

    await service.query(admin, "/admin/accounts?filter.state=ACTIVE");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ status: "ACTIVE", deletedAt: null }] });

    await service.query(admin, "/admin/accounts?filter.state=DISABLED");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ status: "DISABLED", deletedAt: null }] });

    await service.query(admin, "/admin/accounts?filter.state=DELETED");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({ AND: [{ deletedAt: { not: null } }] });

    await service.query(admin, "/admin/accounts?filter.from=2026-07-01&filter.to=2026-07-25");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ createdAt: { gte: new Date("2026-07-01T00:00:00.000Z"), lt: new Date("2026-07-26T00:00:00.000Z") } }],
    });

    await service.query(admin, "/admin/accounts?q=Ana");
    expect(readWindow.mock.calls.at(-1)?.[0].where).toEqual({
      AND: [{ OR: [
        { username: { contains: "Ana", mode: "insensitive" } },
        { email: { contains: "Ana", mode: "insensitive" } },
      ] }],
    });
  });

  it("resets a stale cursor without I/O and shares cursors across administrators", async () => {
    const rows = Array.from({ length: 120 }, (_, index) => summary(index + 1));
    const { store, readWindow } = storeWith(rows.slice(0, 101));
    const service = serviceWith(store);
    const sized = await service.query(admin, "/admin/accounts?pageSize=100");
    if (sized.status !== "ready" || !sized.nextCursor) throw new Error("expected a ready sized page");

    readWindow.mockClear();
    await expect(service.query(admin, `/admin/accounts?cursor=${sized.nextCursor}`)).resolves.toEqual({
      status: "redirect",
      location: "/admin/accounts",
    });
    expect(readWindow).not.toHaveBeenCalled();

    // Administrator-global cursors are purpose-bound, not principal-bound.
    await expect(service.query(otherAdmin, "/admin/accounts?pageSize=100")).resolves.toMatchObject({ status: "ready" });
    await expect(service.query(otherAdmin, `/admin/accounts?pageSize=100&cursor=${sized.nextCursor}`)).resolves.toMatchObject({
      status: "ready",
    });
  });

  it("rejects a cursor minted for another directory without I/O", async () => {
    const { store, readWindow } = storeWith([summary(1)]);
    const service = serviceWith(store);
    const codec = createDirectoryCursorCodec(codecKey);
    const foreignCursor = codec.encode(
      {
        directory: "admin-order-v2",
        scopePurpose: "ADMIN_GLOBAL",
        principalId: admin.id,
        size: 50,
        canonicalFilterQuery: "",
        orderId: "created-at-id-desc",
      },
      "forward",
      [Date.UTC(2026, 6, 25, 12, 0, 0), "440e8400-e29b-41d4-a716-000000000001"],
    );
    await expect(service.query(admin, `/admin/accounts?cursor=${foreignCursor}`)).resolves.toEqual({
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
        directory: "admin-users",
        scopePurpose: "MERCHANT_OWN",
        principalId: merchant.id,
        size: 50,
        canonicalFilterQuery: "",
        orderId: "created-at-id-desc",
      },
      "forward",
      [Date.UTC(2026, 6, 25, 12, 0, 0), "440e8400-e29b-41d4-a716-000000000001"],
    );
    await expect(service.query(admin, `/admin/accounts?cursor=${foreignCursor}`)).resolves.toEqual({
      status: "invalid-query",
    });
    expect(readWindow).not.toHaveBeenCalled();
  });

  it("denies every read to non-administrator principals before any I/O", async () => {
    const { store, readWindow, readDetail } = storeWith([summary(1)]);
    const service = serviceWith(store);
    await expect(service.query(merchant, "/admin/accounts")).rejects.toBeInstanceOf(DirectoryAuthorizationError);
    await expect(service.getAdminUserDetail(merchant, "440e8400-e29b-41d4-a716-000000000001")).rejects.toBeInstanceOf(ForbiddenError);
    const disabledAdmin = { ...admin, status: "DISABLED" as const };
    await expect(service.query(disabledAdmin, "/admin/accounts")).rejects.toBeInstanceOf(DirectoryAuthorizationError);
    await expect(service.getAdminUserDetail(disabledAdmin, "440e8400-e29b-41d4-a716-000000000001")).rejects.toBeInstanceOf(ForbiddenError);
    expect(readWindow).not.toHaveBeenCalled();
    expect(readDetail).not.toHaveBeenCalled();
  });

  it("reads the detail only for a well-formed user identity", async () => {
    const { store, readDetail } = storeWith([]);
    const service = serviceWith(store);
    await expect(service.getAdminUserDetail(admin, "440E8400-E29B-41D4-A716-000000000001")).resolves.toEqual(detail(1));
    expect(readDetail).toHaveBeenCalledWith("440e8400-e29b-41d4-a716-000000000001");
    await expect(service.getAdminUserDetail(admin, "not-a-user")).resolves.toBeNull();
    await expect(service.getAdminUserDetail(admin, 42)).resolves.toBeNull();
    expect(readDetail).toHaveBeenCalledTimes(1);

    readDetail.mockResolvedValueOnce(null);
    await expect(service.getAdminUserDetail(admin, "440e8400-e29b-41d4-a716-000000000099")).resolves.toBeNull();
  });

  it("carries only the row facts plus the storefront slug on the detail", async () => {
    const { store } = storeWith([]);
    const service = serviceWith(store);
    const found = await service.getAdminUserDetail(admin, "440e8400-e29b-41d4-a716-000000000001");
    expect(found).not.toBeNull();
    expect(Object.keys(found as AdminUserDetail).sort()).toEqual([
      "createdAt",
      "deletedAt",
      "email",
      "id",
      "lastActivityAt",
      "role",
      "state",
      "status",
      "storefrontSlug",
      "storeState",
      "username",
    ].sort());
  });
});

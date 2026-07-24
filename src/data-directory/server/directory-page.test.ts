import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Principal } from "@/auth/authorization";

import {
  compareDirectoryRows,
  queryAdministratorDirectory,
  queryMerchantDirectory,
  type DirectoryAdapter,
  type DirectoryOrderField,
  type DirectoryPage,
} from "./directory-page";
import { createDirectoryCursorCodec, hashDirectoryFilters } from "./cursor";

type Row = Readonly<{ id: string; ownerId: string; rank: number }>;
const rows: Row[] = [
  { id: "a", ownerId: "merchant-a", rank: 1 },
  { id: "b", ownerId: "merchant-a", rank: 1 },
  { id: "c", ownerId: "merchant-a", rank: 2 },
  { id: "d", ownerId: "merchant-b", rank: 2 },
];
const order: readonly DirectoryOrderField<Row>[] = [
  { id: "rank", direction: "asc", value: (row) => row.rank },
  { id: "id", direction: "asc", value: (row) => row.id, keyRole: "UNIQUE_IMMUTABLE_ID" },
];
const merchant: Principal = {
  id: "merchant-a",
  username: "merchant",
  email: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: new Date("2026-07-24T00:00:00Z"),
};
const admin = { ...merchant, id: "admin", role: "ADMIN" as const };
const codec = createDirectoryCursorCodec(() => Buffer.alloc(32, 9));

function memoryAdapter(source: readonly Row[]) {
  const readWindow = vi.fn<DirectoryAdapter<Row>["readWindow"]>(async (input) => {
    const ownerId = input.scope.purpose === "MERCHANT_OWN" ? input.scope.ownerId : null;
    const scoped = ownerId === null ? [...source] : source.filter((row) => row.ownerId === ownerId);
    const sorted = [...scoped].sort((left, right) => compareDirectoryRows(left, right, input.order));
    const afterSeek = input.seek
      ? sorted.filter((row) => {
          for (let index = 0; index < input.order.length; index += 1) {
            const field = input.order[index];
            const left = field.value(row);
            const right = input.seek?.[index] ?? null;
            if (left === right) continue;
            const comparison = left === null ? -1 : right === null ? 1 : left < right ? -1 : 1;
            const canonical = field.direction === "asc" ? comparison : -comparison;
            return input.direction === "forward" ? canonical > 0 : canonical < 0;
          }
          return false;
        })
      : sorted;
    const traversed = input.direction === "backward" ? afterSeek.reverse() : afterSeek;
    return traversed.slice(0, input.limit);
  });
  return { readWindow };
}

const base = {
  directory: "specimen",
  orderId: "rank-id",
  order,
  filters: {},
  canonicalFilterQuery: "",
  pageSize: 25 as const,
};

function decodeCursor(token: string, scopePurpose: "ADMIN_GLOBAL" | "MERCHANT_OWN", principalId: string) {
  const decoded = codec.decode(token, {
    directory: "specimen",
    scopePurpose,
    principalId,
    size: 25,
    canonicalFilterQuery: "",
    orderId: "rank-id",
  }, (tuple) => tuple.length === order.length);
  if (decoded.status !== "valid") throw new Error(`Expected a valid cursor, received ${decoded.status}`);
  return decoded.cursor;
}

const decodeAdminCursor = (token: string) => decodeCursor(token, "ADMIN_GLOBAL", "admin");
const decodeMerchantCursor = (token: string) => decodeCursor(token, "MERCHANT_OWN", "merchant-a");

describe("role-scoped stable directory windows", () => {
  it("rechecks roles before I/O and never falls back across scopes", async () => {
    const adapter = memoryAdapter(rows);
    await expect(queryMerchantDirectory({ ...base, principal: admin, adapter })).rejects.toThrow("Merchant");
    await expect(queryAdministratorDirectory({ ...base, principal: merchant, adapter })).rejects.toThrow("Administrator");
    expect(adapter.readWindow).not.toHaveBeenCalled();
  });

  it("rejects cross-scope or mismatched cursor context before I/O", async () => {
    const adapter = memoryAdapter(rows);
    const cursor = {
      version: 1 as const,
      directory: "specimen",
      scopePurpose: "ADMIN_GLOBAL" as const,
      direction: "forward" as const,
      size: 25 as const,
      filterHash: hashDirectoryFilters(""),
      orderId: "rank-id",
      tuple: [1, "a"],
    };
    await expect(queryMerchantDirectory({ ...base, principal: merchant, adapter, cursor }, codec)).rejects.toThrow("Invalid directory cursor");
    expect(adapter.readWindow).not.toHaveBeenCalled();
  });

  it("rejects an order without a terminal unique immutable ID before I/O", async () => {
    const adapter = memoryAdapter(rows);
    for (const unstableOrder of [
      [{ id: "rank", direction: "asc", value: (row: Row) => row.rank }],
      [
        { id: "rank", direction: "asc", value: (row: Row) => row.rank, keyRole: "UNIQUE_IMMUTABLE_ID" as const },
        { id: "id", direction: "asc", value: (row: Row) => row.id },
      ],
    ] satisfies Array<readonly DirectoryOrderField<Row>[]>) {
      await expect(queryAdministratorDirectory({
        ...base,
        principal: admin,
        adapter,
        order: unstableOrder,
      }, codec)).rejects.toThrow("Invalid directory order contract");
    }
    expect(adapter.readWindow).not.toHaveBeenCalled();
  });

  it("derives merchant ownership server-side and requests exactly size + 1 without a count", async () => {
    const adapter = memoryAdapter(rows);
    const page = await queryMerchantDirectory({ ...base, principal: merchant, adapter });
    expect(page.rows.map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(adapter.readWindow).toHaveBeenCalledTimes(1);
    expect(adapter.readWindow).toHaveBeenCalledWith(expect.objectContaining({
      scope: { purpose: "MERCHANT_OWN", ownerId: "merchant-a" },
      limit: 26,
    }));
  });

  it("uses a unique tie-breaker for forward and reverse boundaries", async () => {
    const adapter = memoryAdapter(rows);
    const small = { ...base, pageSize: 25 as const };
    const forward = await queryAdministratorDirectory({ ...small, principal: admin, adapter }, codec);
    expect(forward.rows.map(({ id }) => id)).toEqual(["a", "b", "c", "d"]);

    const withBoundary = await queryAdministratorDirectory({
      ...small,
      principal: admin,
      adapter,
      cursor: {
        version: 1,
        directory: "specimen",
        scopePurpose: "ADMIN_GLOBAL",
        direction: "forward",
        size: 25,
        filterHash: hashDirectoryFilters(""),
        orderId: "rank-id",
        tuple: [1, "a"],
      },
    }, codec);
    expect(withBoundary.rows.map(({ id }) => id)).toEqual(["b", "c", "d"]);
  });

  it("traverses emitted next and previous cursors across duplicate leading values", async () => {
    const manyRows = Array.from({ length: 63 }, (_, index): Row => ({
      id: `row-${String(index).padStart(3, "0")}`,
      ownerId: "merchant-a",
      rank: Math.floor(index / 4),
    }));
    const adapter = memoryAdapter(manyRows);
    const pages: DirectoryPage<Row>[] = [];
    let cursor: ReturnType<typeof decodeAdminCursor> | undefined;
    do {
      const page = await queryAdministratorDirectory({ ...base, principal: admin, adapter, ...(cursor ? { cursor } : {}) }, codec);
      pages.push(page);
      cursor = page.nextCursor ? decodeAdminCursor(page.nextCursor) : undefined;
    } while (cursor);

    expect(pages.map(({ rows: pageRows }) => pageRows.length)).toEqual([25, 25, 13]);
    const forwardIds = pages.flatMap(({ rows: pageRows }) => pageRows.map(({ id }) => id));
    expect(forwardIds).toEqual(manyRows.map(({ id }) => id));
    expect(new Set(forwardIds).size).toBe(manyRows.length);

    const lastPage = pages.at(-1);
    if (!lastPage?.previousCursor) throw new Error("Expected a previous cursor on the last page");
    const middle = await queryAdministratorDirectory({
      ...base,
      principal: admin,
      adapter,
      cursor: decodeAdminCursor(lastPage.previousCursor),
    }, codec);
    expect(middle.rows.map(({ id }) => id)).toEqual(manyRows.slice(25, 50).map(({ id }) => id));
    if (!middle.previousCursor) throw new Error("Expected a previous cursor on the middle page");
    const first = await queryAdministratorDirectory({
      ...base,
      principal: admin,
      adapter,
      cursor: decodeAdminCursor(middle.previousCursor),
    }, codec);
    expect(first.rows.map(({ id }) => id)).toEqual(manyRows.slice(0, 25).map(({ id }) => id));
    expect(first.previousCursor).toBeUndefined();
  });

  it("keeps surviving rows stable while concurrent inserts and deletes remain naturally visible", async () => {
    const mutableRows = Array.from({ length: 54 }, (_, index): Row => ({
      id: `row-${String(index).padStart(3, "0")}`,
      ownerId: "merchant-a",
      rank: Math.floor(index / 3),
    }));
    const originalIds = mutableRows.map(({ id }) => id);
    const adapter = memoryAdapter(mutableRows);
    const first = await queryMerchantDirectory({ ...base, principal: merchant, adapter }, codec);
    if (!first.nextCursor) throw new Error("Expected a next cursor on the first page");

    const deletedFutureId = "row-031";
    mutableRows.splice(mutableRows.findIndex(({ id }) => id === deletedFutureId), 1);
    mutableRows.push(
      { id: "inserted-before", ownerId: "merchant-a", rank: 0 },
      { id: "inserted-after", ownerId: "merchant-a", rank: 20 },
    );

    const collected = [...first.rows];
    let cursor = decodeMerchantCursor(first.nextCursor);
    while (cursor) {
      const page = await queryMerchantDirectory({ ...base, principal: merchant, adapter, cursor }, codec);
      collected.push(...page.rows);
      if (!page.nextCursor) break;
      cursor = decodeMerchantCursor(page.nextCursor);
    }

    const collectedIds = collected.map(({ id }) => id);
    const survivingOriginals = originalIds.filter((id) => id !== deletedFutureId);
    expect(collectedIds.filter((id) => survivingOriginals.includes(id))).toEqual(survivingOriginals);
    expect(collectedIds).toContain("inserted-after");
    expect(collectedIds).not.toContain("inserted-before");
    expect(new Set(collectedIds).size).toBe(collectedIds.length);
  });
});

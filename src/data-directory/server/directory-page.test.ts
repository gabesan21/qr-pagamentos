import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Principal } from "@/auth/authorization";

import {
  compareDirectoryRows,
  queryAdministratorDirectory,
  queryMerchantDirectory,
  type DirectoryAdapter,
  type DirectoryOrderField,
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
  { id: "id", direction: "asc", value: (row) => row.id },
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
    const traversed = input.direction === "backward" ? sorted.reverse() : sorted;
    const seekIndex = input.seek
      ? traversed.findIndex((row) => input.order.every((field, index) => field.value(row) === input.seek?.[index]))
      : -1;
    return traversed.slice(seekIndex + 1, seekIndex + 1 + input.limit);
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

  it("documents natural visibility of concurrent inserts and deletes without duplicate survivors", async () => {
    const adapter = memoryAdapter(rows.filter(({ id }) => id !== "b").concat({
      id: "bb",
      ownerId: "merchant-a",
      rank: 1,
    }));
    const page = await queryMerchantDirectory({ ...base, principal: merchant, adapter });
    expect(page.rows.map(({ id }) => id)).toEqual(["a", "bb", "c"]);
    expect(new Set(page.rows.map(({ id }) => id)).size).toBe(page.rows.length);
  });
});

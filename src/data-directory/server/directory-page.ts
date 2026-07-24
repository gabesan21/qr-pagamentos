import "server-only";

import type { Principal } from "@/auth/authorization";

import {
  createDirectoryCursorCodec,
  hashDirectoryFilters,
  type DirectoryCursorCodec,
  type DirectoryCursorDirection,
  type DirectoryCursorEnvelope,
  type DirectoryScopePurpose,
} from "./cursor";
import type { DirectoryPageSize } from "./query-contract";

export type DirectoryScope =
  | Readonly<{ purpose: "MERCHANT_OWN"; ownerId: string }>
  | Readonly<{ purpose: "ADMIN_GLOBAL" }>;

export type DirectoryOrderField<Row> = Readonly<{
  id: string;
  direction: "asc" | "desc";
  value: (row: Row) => string | number | boolean | null;
  keyRole?: "UNIQUE_IMMUTABLE_ID";
}>;

export type DirectoryReadInput<Row> = Readonly<{
  scope: DirectoryScope;
  filters: Readonly<Record<string, string | readonly string[]>>;
  direction: DirectoryCursorDirection;
  seek?: DirectoryCursorEnvelope["tuple"];
  limit: number;
  order: readonly DirectoryOrderField<Row>[];
}>;

export interface DirectoryAdapter<Row> {
  readWindow(input: DirectoryReadInput<Row>): Promise<readonly Row[]>;
}

export class DirectoryAuthorizationError extends Error {}

type QueryDirectoryInput<Row> = Readonly<{
  principal: Principal;
  directory: string;
  orderId: string;
  order: readonly DirectoryOrderField<Row>[];
  filters: Readonly<Record<string, string | readonly string[]>>;
  canonicalFilterQuery: string;
  pageSize: DirectoryPageSize;
  cursor?: DirectoryCursorEnvelope;
  adapter: DirectoryAdapter<Row>;
}>;

export type DirectoryPage<Row> = Readonly<{
  rows: readonly Row[];
  nextCursor?: string;
  previousCursor?: string;
}>;

function validOrder<Row>(order: readonly DirectoryOrderField<Row>[]) {
  const terminal = order.at(-1);
  return (
    order.length > 0
    && order.length <= 8
    && new Set(order.map(({ id }) => id)).size === order.length
    && order.every(({ id }) => /^[a-z][a-zA-Z0-9]*$/u.test(id))
    && terminal?.keyRole === "UNIQUE_IMMUTABLE_ID"
    && order.slice(0, -1).every(({ keyRole }) => keyRole === undefined)
  );
}

function validTuple<Row>(
  tuple: DirectoryCursorEnvelope["tuple"],
  order: readonly DirectoryOrderField<Row>[],
) {
  return tuple.length === order.length;
}

function cursorMatchesInput<Row>(
  cursor: DirectoryCursorEnvelope,
  input: QueryDirectoryInput<Row>,
  purpose: DirectoryScopePurpose,
) {
  return (
    cursor.directory === input.directory
    && cursor.scopePurpose === purpose
    && cursor.size === input.pageSize
    && cursor.orderId === input.orderId
    && cursor.filterHash === hashDirectoryFilters(input.canonicalFilterQuery)
    && validTuple(cursor.tuple, input.order)
  );
}

function tupleFor<Row>(row: Row, order: readonly DirectoryOrderField<Row>[]) {
  return order.map(({ value }) => value(row));
}

async function runDirectory<Row>(
  input: QueryDirectoryInput<Row>,
  scope: DirectoryScope,
  codec: DirectoryCursorCodec,
): Promise<DirectoryPage<Row>> {
  if (!validOrder(input.order)) throw new Error("Invalid directory order contract");
  const direction = input.cursor?.direction ?? "forward";
  const fetched = await input.adapter.readWindow({
    scope,
    filters: input.filters,
    direction,
    ...(input.cursor ? { seek: input.cursor.tuple } : {}),
    limit: input.pageSize + 1,
    order: input.order,
  });
  if (fetched.length > input.pageSize + 1) {
    throw new Error("Directory adapter exceeded its bounded result contract");
  }
  const hasMore = fetched.length > input.pageSize;
  const bounded = fetched.slice(0, input.pageSize);
  const rows = direction === "backward" ? [...bounded].reverse() : bounded;
  const context = {
    directory: input.directory,
    scopePurpose: scope.purpose as DirectoryScopePurpose,
    principalId: input.principal.id,
    size: input.pageSize,
    canonicalFilterQuery: input.canonicalFilterQuery,
    orderId: input.orderId,
  };
  return {
    rows,
    ...(hasMore && rows.length > 0
      ? {
          [direction === "forward" ? "nextCursor" : "previousCursor"]: codec.encode(
            context,
            direction,
            tupleFor(direction === "forward" ? rows[rows.length - 1] : rows[0], input.order),
          ),
        }
      : {}),
    ...(input.cursor && rows.length > 0
      ? {
          [direction === "forward" ? "previousCursor" : "nextCursor"]: codec.encode(
            context,
            direction === "forward" ? "backward" : "forward",
            tupleFor(direction === "forward" ? rows[0] : rows[rows.length - 1], input.order),
          ),
        }
      : {}),
  };
}

export async function queryMerchantDirectory<Row>(
  input: QueryDirectoryInput<Row>,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
) {
  if (input.principal.role !== "USER" || input.principal.status !== "ACTIVE") {
    throw new DirectoryAuthorizationError("Merchant access is required");
  }
  const principal = input.principal;
  if (input.cursor && !cursorMatchesInput(input.cursor, input, "MERCHANT_OWN")) {
    throw new Error("Invalid directory cursor");
  }
  return runDirectory(input, { purpose: "MERCHANT_OWN", ownerId: principal.id }, codec);
}

export async function queryAdministratorDirectory<Row>(
  input: QueryDirectoryInput<Row>,
  codec: DirectoryCursorCodec = createDirectoryCursorCodec(),
) {
  if (input.principal.role !== "ADMIN" || input.principal.status !== "ACTIVE") {
    throw new DirectoryAuthorizationError("Administrator access is required");
  }
  if (input.cursor && !cursorMatchesInput(input.cursor, input, "ADMIN_GLOBAL")) {
    throw new Error("Invalid directory cursor");
  }
  return runDirectory(input, { purpose: "ADMIN_GLOBAL" }, codec);
}

export function compareDirectoryRows<Row>(
  left: Row,
  right: Row,
  order: readonly DirectoryOrderField<Row>[],
) {
  for (const field of order) {
    const leftValue = field.value(left);
    const rightValue = field.value(right);
    if (leftValue === rightValue) continue;
    const comparison = leftValue === null ? -1 : rightValue === null ? 1 : leftValue < rightValue ? -1 : 1;
    return field.direction === "asc" ? comparison : -comparison;
  }
  return 0;
}

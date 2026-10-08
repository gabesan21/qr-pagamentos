import "server-only";

import { requireAdminFromCookie } from "../app/admin/guard";
import { ForbiddenError, type Principal } from "../auth/authorization";
import {
  canonicalizeDirectoryRequest,
} from "../data-directory/server/canonical-request";
import {
  createDirectoryCursorCodec,
  type DirectoryCursorCodec,
  type DirectoryCursorEnvelope,
} from "../data-directory/server/cursor";
import {
  queryAdministratorDirectory,
  type DirectoryAdapter,
  type DirectoryOrderField,
  type DirectoryReadInput,
} from "../data-directory/server/directory-page";
import type {
  DirectoryFilterDefinition,
  DirectoryPageSize,
  DirectoryPageSizePolicy,
} from "../data-directory/server/query-contract";
import { getDatabaseClient } from "../db/client";
import { Prisma, type PrismaClient } from "../generated/prisma/client";
import { PAYMENT_LINK_ORDER_STATES } from "./order-v2-policies";
import type { OrderV2DirectoryUsdPair } from "./order-v2-directory";
import {
  orderV2SummarySelect,
  toOrderV2Summary,
  type OrderV2Summary,
  type OrderV2SummaryRow,
} from "./order-v2-view";

// Administrator-global Commerce V2 order directory (10.2.1): the bounded query
// contract of src/data-directory/server over every order_v2 row, read-only.
// Rows are the delivered summary projection plus the owner attribution tuple
// (username, deletedAt) — never provider data, verifiers, lifecycle fields, or
// owner email/id. The owner directory and every delivered V1/V2 service stay
// byte-frozen; mutations do not exist on this surface.

export const ADMIN_ORDER_V2_DIRECTORY_ID = "admin-order-v2";
export const ADMIN_ORDER_V2_DIRECTORY_PATH = "/admin/orders";
export const ADMIN_ORDER_V2_DIRECTORY_ORDER_ID = "created-at-id-desc";

export const ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY = {
  sizes: [10, 20, 50, 100],
  defaultSize: 50,
} as const satisfies DirectoryPageSizePolicy;

// The explicit stateless option the template's provider-state select needs
// beside the eight PaymentLinkOrderState members: STANDALONE and AD_HOC
// orders with no provider attempt yet carry `state: null`, and this value is
// the only registered filter member that maps to that null column.
export const ADMIN_ORDER_V2_DIRECTORY_STATELESS_FILTER_VALUE = "STATELESS";

export const ADMIN_ORDER_V2_DIRECTORY_STATE_FILTER_VALUES = [
  ...PAYMENT_LINK_ORDER_STATES,
  ADMIN_ORDER_V2_DIRECTORY_STATELESS_FILTER_VALUE,
] as const;

export const ADMIN_ORDER_V2_DIRECTORY_FILTERS = [
  { name: "source", kind: "enum", values: ["AD_HOC", "LINK", "STANDALONE"] },
  { name: "state", kind: "enum", values: ADMIN_ORDER_V2_DIRECTORY_STATE_FILTER_VALUES },
  { name: "money", kind: "enum", values: ["FIAT", "USD"] },
  { name: "merchant", kind: "text" },
  { name: "from", kind: "text" },
  { name: "to", kind: "text" },
  { name: "link", kind: "text" },
] as const satisfies readonly DirectoryFilterDefinition[];

// The USD bucket is the active registry mapping for code "USD"; every other
// order (any other active code, or a deactivated/unmapped pair) is FIAT. Same
// read-only registry resolution as the owner directory.
const USD_EXCHANGE_CURRENCY_CODE = "USD";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// The administrator-only owner attribution: a soft-deleted owner never loses
// its rows; the badge fact travels only on this administrator surface.
export type AdminOrderV2Owner = Readonly<{
  username: string;
  deletedAt: Date | null;
}>;

export type AdminOrderV2Summary = OrderV2Summary & Readonly<{
  owner: AdminOrderV2Owner;
}>;

const directoryOrder = [
  { id: "createdAt", direction: "desc", value: (row: AdminOrderV2Summary) => row.createdAt.getTime() },
  { id: "id", direction: "desc", value: (row: AdminOrderV2Summary) => row.id, keyRole: "UNIQUE_IMMUTABLE_ID" },
] as const satisfies readonly DirectoryOrderField<AdminOrderV2Summary>[];

function isValidSeekTuple(tuple: DirectoryCursorEnvelope["tuple"]) {
  return (
    tuple.length === directoryOrder.length
    && typeof tuple[0] === "number"
    && Number.isSafeInteger(tuple[0])
    && tuple[0] > 0
    && typeof tuple[1] === "string"
    && UUID_PATTERN.test(tuple[1])
  );
}

function calendarDayStartUtc(value: string): Date | null {
  const match = CALENDAR_DAY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (
    start.getUTCFullYear() !== year
    || start.getUTCMonth() !== month - 1
    || start.getUTCDate() !== day
  ) return null;
  return start;
}

function textFilter(filters: DirectoryReadInput<AdminOrderV2Summary>["filters"], name: string) {
  const value = filters[name];
  return typeof value === "string" ? value : undefined;
}

// Date filters are validated before any adapter I/O; an ungrammatical or
// nonexistent calendar day is the zero-I/O invalid-query outcome.
function validDateFilters(filters: DirectoryReadInput<AdminOrderV2Summary>["filters"]) {
  const from = textFilter(filters, "from");
  const to = textFilter(filters, "to");
  if (from !== undefined && calendarDayStartUtc(from) === null) return false;
  if (to !== undefined && calendarDayStartUtc(to) === null) return false;
  return true;
}

function requireAdministrator(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

export type AdminOrderV2DirectoryRead = Readonly<{
  where: Prisma.OrderV2WhereInput;
  ascending: boolean;
  take: number;
  resolvedStatus?: string | null;
}>;

export type AdminOrderV2DirectoryStore = Readonly<{
  findActiveUsdPair(): Promise<OrderV2DirectoryUsdPair | null>;
  readWindow(input: AdminOrderV2DirectoryRead): Promise<AdminOrderV2Summary[]>;
  readOwnerAttribution(orderId: string): Promise<AdminOrderV2Owner | null>;
}>;

function keysetSeek(
  seek: DirectoryCursorEnvelope["tuple"],
  direction: "forward" | "backward",
): Prisma.OrderV2WhereInput {
  const createdAt = new Date(seek[0] as number);
  const id = seek[1] as string;
  const before = direction === "forward";
  return {
    OR: [
      { createdAt: before ? { lt: createdAt } : { gt: createdAt } },
      { createdAt: { equals: createdAt }, id: before ? { lt: id } : { gt: id } },
    ],
  };
}

async function readWindow(
  store: AdminOrderV2DirectoryStore,
  input: DirectoryReadInput<AdminOrderV2Summary>,
): Promise<readonly AdminOrderV2Summary[]> {
  if (input.scope.purpose !== "ADMIN_GLOBAL") {
    throw new Error("The administrator order directory reads only an administrator-global scope");
  }
  const and: Prisma.OrderV2WhereInput[] = [];

  const source = input.filters.source;
  if (Array.isArray(source) && source.length === 1) and.push({ source: source[0] });

  let resolvedStatus: string | null | undefined;
  const state = input.filters.state;
  if (Array.isArray(state) && state.length === 1) {
    resolvedStatus = state[0] === ADMIN_ORDER_V2_DIRECTORY_STATELESS_FILTER_VALUE ? null : state[0];
  }

  const merchant = textFilter(input.filters, "merchant");
  if (merchant !== undefined) and.push({ owner: { is: { username: { equals: merchant, mode: "insensitive" } } } });

  const money = input.filters.money;
  if (Array.isArray(money) && money.length === 1) {
    const usdPair = await store.findActiveUsdPair();
    if (money[0] === "USD") {
      if (!usdPair) return [];
      and.push({ currencyUuid: usdPair.currencyUuid, exchangeCurrencyUuid: usdPair.exchangeCurrencyUuid });
    } else if (usdPair) {
      and.push({ NOT: { currencyUuid: usdPair.currencyUuid, exchangeCurrencyUuid: usdPair.exchangeCurrencyUuid } });
    }
  }

  const from = textFilter(input.filters, "from");
  const to = textFilter(input.filters, "to");
  const createdBounds: Prisma.DateTimeFilter = {};
  if (from !== undefined) createdBounds.gte = calendarDayStartUtc(from) as Date;
  if (to !== undefined) {
    const toStart = calendarDayStartUtc(to) as Date;
    createdBounds.lt = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
  }
  if (createdBounds.gte !== undefined || createdBounds.lt !== undefined) {
    and.push({ createdAt: createdBounds });
  }

  const link = textFilter(input.filters, "link");
  if (link !== undefined) and.push({ paymentLink: { is: { identifier: link } } });

  // Provider order UUIDs are match-only inside this search; they never leave
  // persistence on a row.
  const search = input.filters.q;
  if (typeof search === "string") {
    if (UUID_PATTERN.test(search)) {
      const id = search.toLowerCase();
      and.push({ OR: [{ id }, { providerOrders: { some: { providerOrderUuid: id } } }] });
    } else {
      and.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { cpf: { contains: search, mode: "insensitive" } },
        ],
      });
    }
  }

  if (input.seek) and.push(keysetSeek(input.seek, input.direction));

  const where: Prisma.OrderV2WhereInput = and.length > 0 ? { AND: and } : {};
  return store.readWindow({ where, ascending: input.direction === "backward", take: input.limit, resolvedStatus });
}

export type AdminOrderV2DirectoryResult =
  | Readonly<{
      status: "ready";
      rows: readonly AdminOrderV2Summary[];
      pageSize: DirectoryPageSize;
      nextCursor?: string;
      previousCursor?: string;
    }>
  | Readonly<{ status: "redirect"; location: string }>
  | Readonly<{ status: "invalid-query" }>;

export function createAdminOrderV2DirectoryService(dependencies: Readonly<{
  store: AdminOrderV2DirectoryStore;
  codec?: DirectoryCursorCodec;
}>) {
  const codec = dependencies.codec ?? createDirectoryCursorCodec();
  const adapter: DirectoryAdapter<AdminOrderV2Summary> = {
    readWindow: (input) => readWindow(dependencies.store, input),
  };
  return {
    async query(
      principal: Principal,
      requestTarget: string,
      path: string = ADMIN_ORDER_V2_DIRECTORY_PATH,
    ): Promise<AdminOrderV2DirectoryResult> {
      const canonical = canonicalizeDirectoryRequest({
        requestTarget,
        path,
        definitions: ADMIN_ORDER_V2_DIRECTORY_FILTERS,
        directory: ADMIN_ORDER_V2_DIRECTORY_ID,
        scopePurpose: "ADMIN_GLOBAL",
        principal,
        orderId: ADMIN_ORDER_V2_DIRECTORY_ORDER_ID,
        validateTuple: isValidSeekTuple,
        pageSizePolicy: ADMIN_ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
      }, codec);
      if (canonical.status !== "ready") return canonical;
      if (!validDateFilters(canonical.query.filters)) return { status: "invalid-query" };

      const page = await queryAdministratorDirectory({
        principal,
        directory: ADMIN_ORDER_V2_DIRECTORY_ID,
        orderId: ADMIN_ORDER_V2_DIRECTORY_ORDER_ID,
        order: directoryOrder,
        // The adapter contract carries filters only; `q` rides alongside them
        // while the canonical filter query keeps it bound into cursor digests.
        filters: {
          ...canonical.query.filters,
          ...(canonical.query.q ? { q: canonical.query.q } : {}),
        },
        canonicalFilterQuery: canonical.query.canonicalFilterQuery,
        pageSize: canonical.query.pageSize,
        ...(canonical.cursor ? { cursor: canonical.cursor } : {}),
        adapter,
      }, codec);
      return {
        status: "ready",
        rows: page.rows,
        pageSize: canonical.query.pageSize,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        ...(page.previousCursor ? { previousCursor: page.previousCursor } : {}),
      };
    },
    // Bounded owner-attribution read for the read-only V2 detail: issued only
    // after the delivered getForAdmin returns found, so a miss here resolves
    // to the same one opaque unavailable outcome.
    async readOwnerAttribution(principal: Principal, orderId: unknown): Promise<AdminOrderV2Owner | null> {
      requireAdministrator(principal);
      if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) return null;
      return dependencies.store.readOwnerAttribution(orderId.toLowerCase());
    },
  };
}

function createPrismaAdminOrderV2DirectoryStore(prisma: PrismaClient): AdminOrderV2DirectoryStore {
  return {
    async findActiveUsdPair() {
      const pointer = await prisma.supportedExchangeCurrency.findUnique({
        where: { code: USD_EXCHANGE_CURRENCY_CODE },
        select: { pair: { select: { currencyUuid: true, exchangeCurrencyUuid: true } } },
      });
      return pointer?.pair ?? null;
    },
    async readWindow({ where, ascending, take, resolvedStatus }) {
      const direction = ascending ? "asc" : "desc";
      if (resolvedStatus !== undefined) {
        const conditions: Prisma.Sql[] = [];
        if (where.source) {
          conditions.push(Prisma.sql`o."source" = ${where.source}`);
        }
        if (where.currencyUuid && where.exchangeCurrencyUuid) {
          conditions.push(Prisma.sql`o."currency_uuid" = ${where.currencyUuid}::uuid AND o."exchange_currency_uuid" = ${where.exchangeCurrencyUuid}::uuid`);
        }
        if (where.NOT && typeof where.NOT === "object" && "currencyUuid" in where.NOT && "exchangeCurrencyUuid" in where.NOT) {
          conditions.push(Prisma.sql`NOT (o."currency_uuid" = ${where.NOT.currencyUuid}::uuid AND o."exchange_currency_uuid" = ${where.NOT.exchangeCurrencyUuid}::uuid)`);
        }
        if (where.createdAt && typeof where.createdAt === "object") {
          if ("gte" in where.createdAt && where.createdAt.gte) {
            conditions.push(Prisma.sql`o."created_at" >= ${where.createdAt.gte}`);
          }
          if ("lt" in where.createdAt && where.createdAt.lt) {
            conditions.push(Prisma.sql`o."created_at" < ${where.createdAt.lt}`);
          }
        }
        if (where.paymentLink && typeof where.paymentLink === "object" && "is" in where.paymentLink && where.paymentLink.is?.identifier) {
          const identifier = where.paymentLink.is.identifier;
          conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "app"."payment_link_v2" pl WHERE pl."id" = o."payment_link_v2_id" AND pl."identifier" = ${identifier})`);
        }
        if (where.AND && Array.isArray(where.AND)) {
          for (const andItem of where.AND) {
            if ("source" in andItem && andItem.source) {
              conditions.push(Prisma.sql`o."source" = ${andItem.source}`);
            }
            if ("owner" in andItem && andItem.owner && typeof andItem.owner === "object" && "is" in andItem.owner && andItem.owner.is && typeof andItem.owner.is === "object" && "username" in andItem.owner.is && andItem.owner.is.username && typeof andItem.owner.is.username === "object" && "equals" in andItem.owner.is.username) {
              const merchantUsername = andItem.owner.is.username.equals as string;
              conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "app"."user" u WHERE u."id" = o."owner_id" AND u."username" ILIKE ${merchantUsername})`);
            }
            if ("currencyUuid" in andItem && "exchangeCurrencyUuid" in andItem && andItem.currencyUuid && andItem.exchangeCurrencyUuid) {
              conditions.push(Prisma.sql`o."currency_uuid" = ${andItem.currencyUuid}::uuid AND o."exchange_currency_uuid" = ${andItem.exchangeCurrencyUuid}::uuid`);
            }
            if ("NOT" in andItem && andItem.NOT && typeof andItem.NOT === "object" && "currencyUuid" in andItem.NOT && "exchangeCurrencyUuid" in andItem.NOT) {
              conditions.push(Prisma.sql`NOT (o."currency_uuid" = ${andItem.NOT.currencyUuid}::uuid AND o."exchange_currency_uuid" = ${andItem.NOT.exchangeCurrencyUuid}::uuid)`);
            }
            if ("createdAt" in andItem && andItem.createdAt && typeof andItem.createdAt === "object") {
              if ("gte" in andItem.createdAt && andItem.createdAt.gte) {
                conditions.push(Prisma.sql`o."created_at" >= ${andItem.createdAt.gte}`);
              }
              if ("lt" in andItem.createdAt && andItem.createdAt.lt) {
                conditions.push(Prisma.sql`o."created_at" < ${andItem.createdAt.lt}`);
              }
            }
            if ("paymentLink" in andItem && andItem.paymentLink && typeof andItem.paymentLink === "object" && "is" in andItem.paymentLink && andItem.paymentLink.is?.identifier) {
              const identifier = andItem.paymentLink.is.identifier;
              conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "app"."payment_link_v2" pl WHERE pl."id" = o."payment_link_v2_id" AND pl."identifier" = ${identifier})`);
            }
            if ("OR" in andItem && Array.isArray(andItem.OR)) {
              const orClauses = andItem.OR;
              const seekClause = orClauses.find((clause) => "createdAt" in clause && clause.createdAt && typeof clause.createdAt === "object" && ("lt" in clause.createdAt || "gt" in clause.createdAt));
              const textSearchClause = orClauses.find((clause) => "name" in clause);
              const uuidSearchClause = orClauses.find((clause) => "id" in clause && typeof clause.id === "string");

              if (seekClause) {
                const c = seekClause as { createdAt: { lt?: Date; gt?: Date } };
                const eqClause = orClauses.find((clause) => "id" in clause && clause.id && typeof clause.id === "object") as { createdAt: { equals: Date }; id: { lt?: string; gt?: string } } | undefined;
                if (c.createdAt.lt && eqClause?.id.lt) {
                  conditions.push(Prisma.sql`(o."created_at" < ${c.createdAt.lt} OR (o."created_at" = ${eqClause.createdAt.equals} AND o."id" < ${eqClause.id.lt}::uuid))`);
                } else if (c.createdAt.gt && eqClause?.id.gt) {
                  conditions.push(Prisma.sql`(o."created_at" > ${c.createdAt.gt} OR (o."created_at" = ${eqClause.createdAt.equals} AND o."id" > ${eqClause.id.gt}::uuid))`);
                }
              } else if (textSearchClause) {
                const nameClause = orClauses.find((cl) => "name" in cl) as { name: { contains: string } } | undefined;
                if (nameClause?.name.contains) {
                  const term = `%${nameClause.name.contains}%`;
                  conditions.push(Prisma.sql`(o."name" ILIKE ${term} OR o."email" ILIKE ${term} OR o."cpf" ILIKE ${term})`);
                }
              } else if (uuidSearchClause) {
                const uuidVal = uuidSearchClause.id as string;
                conditions.push(Prisma.sql`(o."id" = ${uuidVal}::uuid OR EXISTS (SELECT 1 FROM "app"."provider_order" po WHERE po."order_v2_id" = o."id" AND po."provider_order_uuid" = ${uuidVal}::uuid))`);
              }
            }
          }
        }

        if (resolvedStatus === null) {
          conditions.push(Prisma.sql`resolved."status" IS NULL`);
        } else {
          conditions.push(Prisma.sql`resolved."status" = ${resolvedStatus}`);
        }

        const whereClause = conditions.length > 0
          ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
          : Prisma.empty;
        const orderClause = ascending
          ? Prisma.sql`ORDER BY o."created_at" ASC, o."id" ASC`
          : Prisma.sql`ORDER BY o."created_at" DESC, o."id" DESC`;

        const idRows = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT o."id"
          FROM "app"."order_v2" o
          LEFT JOIN LATERAL (
            SELECT lo."outcome"
            FROM "app"."order_local_outcome_v2" lo
            WHERE lo."order_id" = o."id"
            ORDER BY lo."created_at" DESC, lo."id" DESC
            LIMIT 1
          ) latest_outcome ON true
          CROSS JOIN LATERAL (
            SELECT CASE
              WHEN latest_outcome."outcome" = 'LOCAL_CANCELLED' THEN 'CANCELLED'
              ELSE o."state"
            END AS "status"
          ) resolved
          ${whereClause}
          ${orderClause}
          LIMIT ${take}
        `;

        if (idRows.length === 0) return [];
        const ids = idRows.map((r) => r.id);
        const rows = await prisma.orderV2.findMany({
          where: { id: { in: ids } },
          select: {
            ...orderV2SummarySelect,
            owner: { select: { username: true, deletedAt: true } },
          },
        });
        const summaryMap = new Map(rows.map((row) => [row.id, {
          ...toOrderV2Summary(row as OrderV2SummaryRow),
          owner: { username: row.owner.username, deletedAt: row.owner.deletedAt },
        }]));
        return ids.map((id) => summaryMap.get(id)!).filter(Boolean);
      }

      const rows = await prisma.orderV2.findMany({
        where,
        orderBy: [{ createdAt: direction }, { id: direction }],
        take,
        select: {
          ...orderV2SummarySelect,
          owner: { select: { username: true, deletedAt: true } },
        },
      });
      return rows.map((row) => ({
        ...toOrderV2Summary(row as OrderV2SummaryRow),
        owner: { username: row.owner.username, deletedAt: row.owner.deletedAt },
      }));
    },
    async readOwnerAttribution(orderId) {
      const row = await prisma.orderV2.findUnique({
        where: { id: orderId },
        select: { owner: { select: { username: true, deletedAt: true } } },
      });
      return row ? { username: row.owner.username, deletedAt: row.owner.deletedAt } : null;
    },
  };
}

export function getAdminOrderV2DirectoryService() {
  return createAdminOrderV2DirectoryService({ store: createPrismaAdminOrderV2DirectoryStore(getDatabaseClient()) });
}

// Single server entry for the administrator directory: cookie principal first,
// then canonicalization, then the bounded administrator-global read.
export async function queryAdminOrderV2Directory(
  requestTarget: string,
  path: string = ADMIN_ORDER_V2_DIRECTORY_PATH,
): Promise<AdminOrderV2DirectoryResult> {
  const principal = await requireAdminFromCookie();
  return getAdminOrderV2DirectoryService().query(principal, requestTarget, path);
}

import "server-only";

import { requireOwnerFromCookie } from "../app/owner-guard";
import type { Principal } from "../auth/authorization";
import {
  canonicalizeDirectoryRequest,
} from "../data-directory/server/canonical-request";
import {
  createDirectoryCursorCodec,
  type DirectoryCursorCodec,
  type DirectoryCursorEnvelope,
} from "../data-directory/server/cursor";
import {
  queryMerchantDirectory,
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
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import {
  orderV2SummarySelect,
  toOrderV2Summary,
  type OrderV2Summary,
  type OrderV2SummaryRow,
} from "./order-v2-view";
import { PAYMENT_LINK_ORDER_STATES } from "./order-v2-policies";

// Owner-scoped Commerce V2 order directory (8.3.1): the bounded query contract
// of src/data-directory/server over order_v2, read-only. Mutations stay with
// order-v2.ts/order-engagement-v2.ts and rendering with the (merchant) pages.

export const ORDER_V2_DIRECTORY_ID = "owner-order-v2";
export const ORDER_V2_DIRECTORY_PATH = "/orders";
export const ORDER_V2_DIRECTORY_ORDER_ID = "created-at-id-desc";

export const ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY = {
  sizes: [10, 20, 50, 100],
  defaultSize: 20,
} as const satisfies DirectoryPageSizePolicy;

// The explicit stateless option the template's provider-state select needs
// beside the eight PaymentLinkOrderState members: STANDALONE and AD_HOC
// orders with no provider attempt yet carry `state: null`, and this value is
// the only registered filter member that maps to that null column. Mirrors
// the administrator directory's registration (10.2.1) on the owner scope.
export const ORDER_V2_DIRECTORY_STATELESS_FILTER_VALUE = "STATELESS";

export const ORDER_V2_DIRECTORY_STATE_FILTER_VALUES = [
  ...PAYMENT_LINK_ORDER_STATES,
  ORDER_V2_DIRECTORY_STATELESS_FILTER_VALUE,
] as const;

export const ORDER_V2_DIRECTORY_FILTERS = [
  { name: "source", kind: "enum", values: ["AD_HOC", "LINK", "STANDALONE"] },
  { name: "state", kind: "enum", values: ORDER_V2_DIRECTORY_STATE_FILTER_VALUES },
  { name: "money", kind: "enum", values: ["FIAT", "USD"] },
  { name: "from", kind: "text" },
  { name: "to", kind: "text" },
  { name: "link", kind: "text" },
] as const satisfies readonly DirectoryFilterDefinition[];

// The USD bucket is the active registry mapping for code "USD"; every other
// order (any other active code, or a deactivated/unmapped pair) is FIAT. The
// registry exposes no pair-to-code read, so the adapter resolves the one
// durable pair (currencyUuid, exchangeCurrencyUuid) behind the active "USD"
// pointer directly from the registry tables, read-only.
const USD_EXCHANGE_CURRENCY_CODE = "USD";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const directoryOrder = [
  { id: "createdAt", direction: "desc", value: (row: OrderV2Summary) => row.createdAt.getTime() },
  { id: "id", direction: "desc", value: (row: OrderV2Summary) => row.id, keyRole: "UNIQUE_IMMUTABLE_ID" },
] as const satisfies readonly DirectoryOrderField<OrderV2Summary>[];

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

function textFilter(filters: DirectoryReadInput<OrderV2Summary>["filters"], name: string) {
  const value = filters[name];
  return typeof value === "string" ? value : undefined;
}

// Date filters are validated before any adapter I/O; an ungrammatical or
// nonexistent calendar day is the zero-I/O invalid-query outcome.
function validDateFilters(filters: DirectoryReadInput<OrderV2Summary>["filters"]) {
  const from = textFilter(filters, "from");
  const to = textFilter(filters, "to");
  if (from !== undefined && calendarDayStartUtc(from) === null) return false;
  if (to !== undefined && calendarDayStartUtc(to) === null) return false;
  return true;
}

export type OrderV2DirectoryUsdPair = Readonly<{
  currencyUuid: string;
  exchangeCurrencyUuid: string;
}>;

// H-17.1: the render needs each row's display currency code, which the summary
// DTO deliberately omits. The registry has no pair-to-code read, so the
// service resolves only the distinct pairs present on the returned page
// through the pair's active supported-exchange-currency pointer, read-only.
export type OrderV2DirectoryPairCode = Readonly<{
  pair: OrderV2DirectoryUsdPair;
  code: string | null;
}>;

export function orderV2PairKey(pair: OrderV2DirectoryUsdPair) {
  return `${pair.currencyUuid}:${pair.exchangeCurrencyUuid}`;
}

export type OrderV2DirectoryRead = Readonly<{
  where: Prisma.OrderV2WhereInput;
  ascending: boolean;
  take: number;
}>;

export type OrderV2DirectoryStore = Readonly<{
  findActiveUsdPair(): Promise<OrderV2DirectoryUsdPair | null>;
  findPairCodes(pairs: readonly OrderV2DirectoryUsdPair[]): Promise<readonly OrderV2DirectoryPairCode[]>;
  readWindow(input: OrderV2DirectoryRead): Promise<OrderV2Summary[]>;
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
  store: OrderV2DirectoryStore,
  input: DirectoryReadInput<OrderV2Summary>,
): Promise<readonly OrderV2Summary[]> {
  if (input.scope.purpose !== "MERCHANT_OWN") {
    throw new Error("The owner order directory reads only a merchant-own scope");
  }
  const and: Prisma.OrderV2WhereInput[] = [];

  const source = input.filters.source;
  if (Array.isArray(source) && source.length === 1) and.push({ source: source[0] });

  const state = input.filters.state;
  if (Array.isArray(state) && state.length === 1) {
    and.push({ state: state[0] === ORDER_V2_DIRECTORY_STATELESS_FILTER_VALUE ? null : state[0] });
  }

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

  const where: Prisma.OrderV2WhereInput = { ownerId: input.scope.ownerId };
  if (and.length > 0) where.AND = and;
  return store.readWindow({ where, ascending: input.direction === "backward", take: input.limit });
}

export type OrderV2DirectoryResult =
  | Readonly<{
      status: "ready";
      rows: readonly OrderV2Summary[];
      // Distinct display codes for the pairs on this page, keyed by
      // `orderV2PairKey`; pairs with no active code are absent.
      pairCodes: ReadonlyMap<string, string>;
      pageSize: DirectoryPageSize;
      nextCursor?: string;
      previousCursor?: string;
    }>
  | Readonly<{ status: "redirect"; location: string }>
  | Readonly<{ status: "invalid-query" }>;

// Only the distinct pairs on the returned page reach the registry read; an
// empty page therefore performs no registry I/O at all.
function distinctPagePairs(rows: readonly OrderV2Summary[]): readonly OrderV2DirectoryUsdPair[] {
  const seen = new Set<string>();
  const pairs: OrderV2DirectoryUsdPair[] = [];
  for (const row of rows) {
    const pair = { currencyUuid: row.currencyUuid, exchangeCurrencyUuid: row.exchangeCurrencyUuid };
    const key = orderV2PairKey(pair);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(pair);
  }
  return pairs;
}

async function resolvePairCodes(store: OrderV2DirectoryStore, rows: readonly OrderV2Summary[]) {
  const pairs = distinctPagePairs(rows);
  if (pairs.length === 0) return new Map<string, string>();
  const codes = await store.findPairCodes(pairs);
  const map = new Map<string, string>();
  for (const entry of codes) {
    if (entry.code !== null) map.set(orderV2PairKey(entry.pair), entry.code);
  }
  return map;
}

export function createOrderV2DirectoryService(dependencies: Readonly<{
  store: OrderV2DirectoryStore;
  codec?: DirectoryCursorCodec;
}>) {
  const codec = dependencies.codec ?? createDirectoryCursorCodec();
  const adapter: DirectoryAdapter<OrderV2Summary> = {
    readWindow: (input) => readWindow(dependencies.store, input),
  };
  return {
    async query(
      principal: Principal,
      requestTarget: string,
      path: string = ORDER_V2_DIRECTORY_PATH,
    ): Promise<OrderV2DirectoryResult> {
      const canonical = canonicalizeDirectoryRequest({
        requestTarget,
        path,
        definitions: ORDER_V2_DIRECTORY_FILTERS,
        directory: ORDER_V2_DIRECTORY_ID,
        scopePurpose: "MERCHANT_OWN",
        principal,
        orderId: ORDER_V2_DIRECTORY_ORDER_ID,
        validateTuple: isValidSeekTuple,
        pageSizePolicy: ORDER_V2_DIRECTORY_PAGE_SIZE_POLICY,
      }, codec);
      if (canonical.status !== "ready") return canonical;
      if (!validDateFilters(canonical.query.filters)) return { status: "invalid-query" };

      const page = await queryMerchantDirectory({
        principal,
        directory: ORDER_V2_DIRECTORY_ID,
        orderId: ORDER_V2_DIRECTORY_ORDER_ID,
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
        pairCodes: await resolvePairCodes(dependencies.store, page.rows),
        pageSize: canonical.query.pageSize,
        ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
        ...(page.previousCursor ? { previousCursor: page.previousCursor } : {}),
      };
    },
  };
}

function createPrismaOrderV2DirectoryStore(prisma: PrismaClient): OrderV2DirectoryStore {
  return {
    async findActiveUsdPair() {
      const pointer = await prisma.supportedExchangeCurrency.findUnique({
        where: { code: USD_EXCHANGE_CURRENCY_CODE },
        select: { pair: { select: { currencyUuid: true, exchangeCurrencyUuid: true } } },
      });
      return pointer?.pair ?? null;
    },
    // Bounded by the distinct page pairs the service already deduplicated;
    // the only non-`readWindow` registry read this directory performs.
    async findPairCodes(pairs) {
      if (pairs.length === 0) return [];
      const rows = await prisma.catalogCurrencyPair.findMany({
        where: {
          OR: pairs.map((pair) => ({ currencyUuid: pair.currencyUuid, exchangeCurrencyUuid: pair.exchangeCurrencyUuid })),
        },
        select: {
          currencyUuid: true,
          exchangeCurrencyUuid: true,
          supportedExchangeCurrency: { select: { code: true } },
        },
      });
      return rows.map((row) => ({
        pair: { currencyUuid: row.currencyUuid, exchangeCurrencyUuid: row.exchangeCurrencyUuid },
        code: row.supportedExchangeCurrency?.code ?? null,
      }));
    },
    async readWindow({ where, ascending, take }) {
      const direction = ascending ? "asc" : "desc";
      const rows = await prisma.orderV2.findMany({
        where,
        orderBy: [{ createdAt: direction }, { id: direction }],
        take,
        select: orderV2SummarySelect,
      });
      return rows.map((row) => toOrderV2Summary(row as OrderV2SummaryRow));
    },
  };
}

export function getOrderV2DirectoryService() {
  return createOrderV2DirectoryService({ store: createPrismaOrderV2DirectoryStore(getDatabaseClient()) });
}

// Single server entry for the owner directory: cookie principal first, then
// canonicalization, then the bounded merchant-scoped read.
export async function queryOwnerOrderV2Directory(
  requestTarget: string,
  path: string = ORDER_V2_DIRECTORY_PATH,
): Promise<OrderV2DirectoryResult> {
  const principal = await requireOwnerFromCookie();
  return getOrderV2DirectoryService().query(principal, requestTarget, path);
}

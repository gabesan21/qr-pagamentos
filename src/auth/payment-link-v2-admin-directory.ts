import "server-only";

import { requireAdminFromCookie } from "../app/admin/guard";
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
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { ForbiddenError, type Principal } from "./authorization";
import type { PaymentLinkType } from "./payment-link";
import type { PaymentLinkV2CompositionKind } from "./payment-link-v2";
import {
  PAYMENT_LINK_V2_DERIVED_STATES,
  toPaymentLinkV2DirectoryRow,
  validatePaymentLinkV2DirectoryTuple,
  type PaymentLinkV2DerivedState,
  type PaymentLinkV2DirectoryRow,
  type StoredPaymentLinkV2View,
} from "./payment-link-v2-view";

// Administrator-global Commerce V2 payment-link directory (10.2.2): the
// bounded query contract of src/data-directory/server over every
// payment_link_v2 row, read-only. Rows are the delivered owner directory
// projection plus the owner attribution tuple (username, deletedAt) — never
// currency-pair UUIDs, owner email/id, provider data, verifiers, capability
// material, lifecycle CAS fields, or V1 data. The owner view and every
// delivered V1/V2 service stay byte-frozen; mutations do not exist on this
// surface.

export const ADMIN_PAYMENT_LINK_V2_DIRECTORY_ID = "admin-payment-links-v2";
export const ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH = "/admin/payment-links";
export const ADMIN_PAYMENT_LINK_V2_DIRECTORY_ORDER_ID = "created-at-id-desc";

export const ADMIN_PAYMENT_LINK_V2_DIRECTORY_PAGE_SIZE_POLICY = {
  sizes: [10, 20, 50, 100],
  defaultSize: 50,
} as const satisfies DirectoryPageSizePolicy;

export const ADMIN_PAYMENT_LINK_V2_DIRECTORY_FILTERS = [
  { name: "state", kind: "enum", values: PAYMENT_LINK_V2_DERIVED_STATES },
  { name: "type", kind: "enum", values: ["SINGLE_USE", "REUSABLE"] },
  { name: "kind", kind: "enum", values: ["PRODUCT_LINES", "FIXED_AMOUNT"] },
  { name: "from", kind: "text" },
  { name: "to", kind: "text" },
] as const satisfies readonly DirectoryFilterDefinition[];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LINK_TYPES = ["SINGLE_USE", "REUSABLE"] as const satisfies readonly PaymentLinkType[];
const COMPOSITION_KINDS = ["PRODUCT_LINES", "FIXED_AMOUNT"] as const satisfies readonly PaymentLinkV2CompositionKind[];

// The administrator-only owner attribution: a soft-deleted owner never loses
// its links; the badge fact travels only on this administrator surface.
export type AdminPaymentLinkV2Owner = Readonly<{
  username: string;
  deletedAt: Date | null;
}>;

export type AdminPaymentLinkV2DirectoryRow = PaymentLinkV2DirectoryRow & Readonly<{
  owner: AdminPaymentLinkV2Owner;
}>;

export type AdminPaymentLinkV2ViewResult =
  | Readonly<{ kind: "found"; link: AdminPaymentLinkV2DirectoryRow }>
  | Readonly<{ kind: "unavailable" }>;

const directoryOrder = [
  { id: "createdAt", direction: "desc", value: (row: AdminPaymentLinkV2DirectoryRow) => row.createdAt.getTime() },
  { id: "id", direction: "desc", value: (row: AdminPaymentLinkV2DirectoryRow) => row.id, keyRole: "UNIQUE_IMMUTABLE_ID" },
] as const satisfies readonly DirectoryOrderField<AdminPaymentLinkV2DirectoryRow>[];

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

function textFilter(filters: DirectoryReadInput<AdminPaymentLinkV2DirectoryRow>["filters"], name: string) {
  const value = filters[name];
  return typeof value === "string" ? value : undefined;
}

// Date filters are validated before any adapter I/O; an ungrammatical or
// nonexistent calendar day is the zero-I/O invalid-query outcome.
function validDateFilters(filters: DirectoryReadInput<AdminPaymentLinkV2DirectoryRow>["filters"]) {
  const from = textFilter(filters, "from");
  const to = textFilter(filters, "to");
  if (from !== undefined && calendarDayStartUtc(from) === null) return false;
  if (to !== undefined && calendarDayStartUtc(to) === null) return false;
  return true;
}

function requireAdministrator(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

export type AdminPaymentLinkV2DirectoryRead = Readonly<{
  where: Prisma.PaymentLinkV2WhereInput;
  ascending: boolean;
  take: number;
}>;

export type AdminStoredPaymentLinkV2 = Readonly<{
  link: StoredPaymentLinkV2View;
  owner: AdminPaymentLinkV2Owner;
}>;

export type AdminPaymentLinkV2DirectoryStore = Readonly<{
  readWindow(input: AdminPaymentLinkV2DirectoryRead): Promise<AdminStoredPaymentLinkV2[]>;
  findForAdmin(id: string): Promise<AdminStoredPaymentLinkV2 | null>;
}>;

function readEnumFilter<T extends string>(
  value: string | readonly string[] | undefined,
  allowed: readonly T[],
): readonly T[] {
  const values = typeof value === "string" ? [value] : value ?? [];
  return values.filter((entry): entry is T => (allowed as readonly string[]).includes(entry));
}

// The derived-state filter mirrors derivePaymentLinkV2State exactly (the owner
// projection keeps its mirror private), so a state selection returns precisely
// the rows whose read-time state matches; the contract test asserts the
// agreement across the whole closed vocabulary.
function confirmedPaymentCondition(): Prisma.PaymentLinkV2WhereInput {
  return {
    OR: [
      { linkType: "SINGLE_USE", singleUseSettlement: { isNot: null } },
      { linkType: "REUSABLE", orders: { some: { source: "LINK", state: "CONFIRMED" } } },
    ],
  };
}

function stateCondition(state: PaymentLinkV2DerivedState, now: Date): Prisma.PaymentLinkV2WhereInput {
  if (state === "inactive") return { active: false };
  if (state === "expired") return { active: true, expiresAt: { lte: now } };
  const unexpired: Prisma.PaymentLinkV2WhereInput = {
    active: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  if (state === "paid") return { AND: [unexpired, confirmedPaymentCondition()] };
  return { AND: [unexpired, { NOT: confirmedPaymentCondition() }] };
}

function keysetSeek(
  seek: DirectoryCursorEnvelope["tuple"],
  direction: "forward" | "backward",
): Prisma.PaymentLinkV2WhereInput {
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
  store: AdminPaymentLinkV2DirectoryStore,
  input: DirectoryReadInput<AdminPaymentLinkV2DirectoryRow>,
  now: () => Date,
): Promise<readonly AdminPaymentLinkV2DirectoryRow[]> {
  if (input.scope.purpose !== "ADMIN_GLOBAL") {
    throw new Error("The administrator payment-link directory reads only an administrator-global scope");
  }
  if (input.seek !== undefined && !validatePaymentLinkV2DirectoryTuple(input.seek)) {
    throw new Error("Invalid payment-link directory cursor tuple");
  }
  const and: Prisma.PaymentLinkV2WhereInput[] = [];

  const compositionKinds = readEnumFilter(input.filters.kind, COMPOSITION_KINDS);
  if (compositionKinds.length > 0) and.push({ compositionKind: { in: [...compositionKinds] } });

  const linkTypes = readEnumFilter(input.filters.type, LINK_TYPES);
  if (linkTypes.length > 0) and.push({ linkType: { in: [...linkTypes] } });

  const states = readEnumFilter(input.filters.state, PAYMENT_LINK_V2_DERIVED_STATES);
  const readAt = now();
  if (states.length > 0) and.push({ OR: states.map((state) => stateCondition(state, readAt)) });

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

  // An exact 24-character identifier matches the link identity; anything else
  // is bilingual description and owner-username containment.
  const search = input.filters.q;
  if (typeof search === "string") {
    if (LINK_IDENTIFIER_PATTERN.test(search)) {
      and.push({ identifier: search });
    } else {
      and.push({
        OR: [
          { descriptionPtBr: { contains: search, mode: "insensitive" } },
          { descriptionEn: { contains: search, mode: "insensitive" } },
          { owner: { is: { username: { contains: search, mode: "insensitive" } } } },
        ],
      });
    }
  }

  if (input.seek) and.push(keysetSeek(input.seek, input.direction));

  const where: Prisma.PaymentLinkV2WhereInput = and.length > 0 ? { AND: and } : {};
  const stored = await store.readWindow({ where, ascending: input.direction === "backward", take: input.limit });
  return stored.map((entry) => ({ ...toPaymentLinkV2DirectoryRow(entry.link, readAt), owner: entry.owner }));
}

export type AdminPaymentLinkV2DirectoryResult =
  | Readonly<{
      status: "ready";
      rows: readonly AdminPaymentLinkV2DirectoryRow[];
      pageSize: DirectoryPageSize;
      nextCursor?: string;
      previousCursor?: string;
    }>
  | Readonly<{ status: "redirect"; location: string }>
  | Readonly<{ status: "invalid-query" }>;

export function createAdminPaymentLinkV2DirectoryService(dependencies: Readonly<{
  store: AdminPaymentLinkV2DirectoryStore;
  codec?: DirectoryCursorCodec;
  now?: () => Date;
}>) {
  const codec = dependencies.codec ?? createDirectoryCursorCodec();
  const now = dependencies.now ?? (() => new Date());
  const adapter: DirectoryAdapter<AdminPaymentLinkV2DirectoryRow> = {
    readWindow: (input) => readWindow(dependencies.store, input, now),
  };
  return {
    async query(
      principal: Principal,
      requestTarget: string,
      path: string = ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH,
    ): Promise<AdminPaymentLinkV2DirectoryResult> {
      const canonical = canonicalizeDirectoryRequest({
        requestTarget,
        path,
        definitions: ADMIN_PAYMENT_LINK_V2_DIRECTORY_FILTERS,
        directory: ADMIN_PAYMENT_LINK_V2_DIRECTORY_ID,
        scopePurpose: "ADMIN_GLOBAL",
        principal,
        orderId: ADMIN_PAYMENT_LINK_V2_DIRECTORY_ORDER_ID,
        validateTuple: validatePaymentLinkV2DirectoryTuple,
        pageSizePolicy: ADMIN_PAYMENT_LINK_V2_DIRECTORY_PAGE_SIZE_POLICY,
      }, codec);
      if (canonical.status !== "ready") return canonical;
      if (!validDateFilters(canonical.query.filters)) return { status: "invalid-query" };

      const page = await queryAdministratorDirectory({
        principal,
        directory: ADMIN_PAYMENT_LINK_V2_DIRECTORY_ID,
        orderId: ADMIN_PAYMENT_LINK_V2_DIRECTORY_ORDER_ID,
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
    // Bounded global read for the read-only V2 detail: re-authorized
    // administrator, no owner scoping, and one opaque unavailable outcome for
    // malformed and missing identities.
    async getForAdmin(actor: Principal, id: unknown): Promise<AdminPaymentLinkV2ViewResult> {
      requireAdministrator(actor);
      if (typeof id !== "string" || !UUID_PATTERN.test(id)) return { kind: "unavailable" };
      const stored = await dependencies.store.findForAdmin(id.toLowerCase());
      return stored
        ? { kind: "found", link: { ...toPaymentLinkV2DirectoryRow(stored.link, now()), owner: stored.owner } }
        : { kind: "unavailable" };
    },
  };
}

// The owner projection's select plus exactly the owner attribution tuple; the
// paid signal and order count keep the delivered read-time semantics.
const adminViewSelect = {
  id: true,
  identifier: true,
  compositionKind: true,
  descriptionPtBr: true,
  descriptionEn: true,
  amount: true,
  linkType: true,
  expiresAt: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  currencyPair: { select: { label: true } },
  lines: {
    select: { position: true, quantity: true, product: { select: { titlePtBr: true, titleEn: true, price: true } } },
    orderBy: { position: "asc" as const },
  },
  singleUseSettlement: { select: { paymentLinkV2Id: true } },
  orders: { where: { source: "LINK", state: "CONFIRMED" }, select: { id: true }, take: 1 },
  _count: { select: { orders: { where: { source: "LINK" } } } },
  owner: { select: { username: true, deletedAt: true } },
} satisfies Prisma.PaymentLinkV2Select;

type PrismaAdminPaymentLinkV2Row = {
  id: string;
  identifier: string;
  compositionKind: string;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  amount: string | null;
  linkType: string;
  expiresAt: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  currencyPair: { label: string };
  lines: Array<{ position: number; quantity: number; product: { titlePtBr: string; titleEn: string; price: string } }>;
  singleUseSettlement: { paymentLinkV2Id: string } | null;
  orders: Array<{ id: string }>;
  _count: { orders: number };
  owner: { username: string; deletedAt: Date | null };
};

function toAdminStored(row: PrismaAdminPaymentLinkV2Row): AdminStoredPaymentLinkV2 {
  return {
    link: {
      id: row.id,
      identifier: row.identifier,
      compositionKind: row.compositionKind as PaymentLinkV2CompositionKind,
      descriptionPtBr: row.descriptionPtBr,
      descriptionEn: row.descriptionEn,
      amount: row.amount,
      currencyPairLabel: row.currencyPair.label,
      linkType: row.linkType as PaymentLinkType,
      expiresAt: row.expiresAt,
      active: row.active,
      // Paid is the type-conditional confirmed settlement: the single-use
      // claim row for SINGLE_USE, at least one CONFIRMED LINK order for
      // REUSABLE.
      paid: row.linkType === "SINGLE_USE" ? row.singleUseSettlement !== null : row.orders.length > 0,
      orderCount: row._count.orders,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lines: row.lines.map((line) => ({
        position: line.position,
        quantity: line.quantity,
        titlePtBr: line.product.titlePtBr,
        titleEn: line.product.titleEn,
        unitPrice: line.product.price,
      })),
    },
    owner: { username: row.owner.username, deletedAt: row.owner.deletedAt },
  };
}

function createPrismaAdminPaymentLinkV2DirectoryStore(prisma: PrismaClient): AdminPaymentLinkV2DirectoryStore {
  return {
    async readWindow({ where, ascending, take }) {
      const direction = ascending ? "asc" : "desc";
      const rows = await prisma.paymentLinkV2.findMany({
        where,
        orderBy: [{ createdAt: direction }, { id: direction }],
        take,
        select: adminViewSelect,
      });
      return rows.map((row) => toAdminStored(row as unknown as PrismaAdminPaymentLinkV2Row));
    },
    async findForAdmin(id) {
      const row = await prisma.paymentLinkV2.findUnique({ where: { id }, select: adminViewSelect });
      return row ? toAdminStored(row as unknown as PrismaAdminPaymentLinkV2Row) : null;
    },
  };
}

export function getAdminPaymentLinkV2DirectoryService() {
  return createAdminPaymentLinkV2DirectoryService({
    store: createPrismaAdminPaymentLinkV2DirectoryStore(getDatabaseClient()),
  });
}

// Single server entry for the administrator directory: cookie principal first,
// then canonicalization, then the bounded administrator-global read.
export async function queryAdminPaymentLinkV2Directory(
  requestTarget: string,
  path: string = ADMIN_PAYMENT_LINK_V2_DIRECTORY_PATH,
): Promise<AdminPaymentLinkV2DirectoryResult> {
  const principal = await requireAdminFromCookie();
  return getAdminPaymentLinkV2DirectoryService().query(principal, requestTarget, path);
}

import "server-only";

import type {
  DirectoryAdapter,
  DirectoryReadInput,
} from "../data-directory/server/directory-page";
import type { DirectoryFilterDefinition } from "../data-directory/server/query-contract";
import { getDatabaseClient } from "../db/client";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { requireUserPrincipal, type Principal } from "./authorization";
import type { PaymentLinkType } from "./payment-link";
import type { PaymentLinkV2CompositionKind } from "./payment-link-v2";

// Derived lifecycle vocabulary for the merchant V2 link directory. The only
// persisted lifecycle facts are `active`, `expires_at`, type, and creation
// metadata; every state below is computed at read time and never stored.
export const PAYMENT_LINK_V2_DERIVED_STATES = ["active", "inactive", "expired", "paid"] as const;
export type PaymentLinkV2DerivedState = (typeof PAYMENT_LINK_V2_DERIVED_STATES)[number];

// The two eras `/links` partitions into: `v2` (this directory's own keyset
// window) and `legacy` (the frozen V1 list, rendered through the same
// `DataDirectory` composition with no cursor). Never blended into one page.
export const PAYMENT_LINK_V2_DIRECTORY_ERA_VALUES = ["v2", "legacy"] as const;
export type PaymentLinkV2DirectoryEra = (typeof PAYMENT_LINK_V2_DIRECTORY_ERA_VALUES)[number];

// Registered filter set for the merchant `/links` directory (era/state/
// type/kind/from/to, plus the additive `pair` enum built from the owner's
// own active pairs when any exist) — at most seven of the eight-filter cap.
export function buildLinksDirectoryFilterDefinitions(
  ownerPairIds: readonly string[] = [],
): readonly DirectoryFilterDefinition[] {
  const definitions: DirectoryFilterDefinition[] = [
    { name: "era", kind: "enum", values: PAYMENT_LINK_V2_DIRECTORY_ERA_VALUES },
    { name: "state", kind: "enum", values: PAYMENT_LINK_V2_DERIVED_STATES },
    { name: "type", kind: "enum", values: ["SINGLE_USE", "REUSABLE"] },
    { name: "kind", kind: "enum", values: ["PRODUCT_LINES", "FIXED_AMOUNT"] },
    { name: "from", kind: "text" },
    { name: "to", kind: "text" },
  ];
  if (ownerPairIds.length > 0) definitions.push({ name: "pair", kind: "enum", values: ownerPairIds });
  return definitions;
}

export type PaymentLinkV2LineSummary = Readonly<{
  position: number;
  quantity: number;
  titlePtBr: string;
  titleEn: string;
  unitPrice: string;
}>;

export type PaymentLinkV2DirectoryRow = Readonly<{
  id: string;
  identifier: string;
  sharePath: string;
  compositionKind: PaymentLinkV2CompositionKind;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  amount: string | null;
  currencyPairLabel: string;
  linkType: PaymentLinkType;
  expiresAt: Date | null;
  active: boolean;
  paid: boolean;
  // Read-time count of every LINK-source order this link generated, in any
  // state; the confirmed subset remains the derived `paid` signal. Never stored.
  orderCount: number;
  state: PaymentLinkV2DerivedState;
  createdAt: Date;
  updatedAt: Date;
  lines: ReadonlyArray<PaymentLinkV2LineSummary>;
}>;

export type PaymentLinkV2View = PaymentLinkV2DirectoryRow;

export type StoredPaymentLinkV2View = Omit<PaymentLinkV2DirectoryRow, "sharePath" | "state">;

// Owner-detail-only additive line fact: whether the line's product is still
// an active, orderable owner row. Read-time only, never stored, and never
// exposed on `listWindow` rows or the administrator reuse.
export type PaymentLinkV2OwnerLineSummary = PaymentLinkV2LineSummary & Readonly<{ available: boolean }>;

// Additive `findForOwner`-only projection: the confirmed LINK-order count and
// its exact confirmed volume (a canonical decimal string, summed in exact
// BigInt micro-units) over the orders already related in this one read, plus
// the per-line availability flag above. `listWindow`, the row DTO it feeds,
// and the administrator reuse of `StoredPaymentLinkV2View` stay unchanged.
export type StoredPaymentLinkV2OwnerDetail = Omit<StoredPaymentLinkV2View, "lines"> & Readonly<{
  lines: ReadonlyArray<PaymentLinkV2OwnerLineSummary>;
  confirmedOrderCount: number;
  confirmedVolume: string;
}>;

export type PaymentLinkV2OwnerDetailView = StoredPaymentLinkV2OwnerDetail & Readonly<{
  sharePath: string;
  state: PaymentLinkV2DerivedState;
}>;

// Cross-owner, malformed, and missing link identities share this one outcome.
export type PaymentLinkV2ViewResult =
  | Readonly<{ kind: "found"; link: PaymentLinkV2OwnerDetailView }>
  | Readonly<{ kind: "unavailable" }>;

export type PaymentLinkV2WindowQuery = Readonly<{
  ownerId: string;
  states: readonly PaymentLinkV2DerivedState[];
  linkTypes: readonly PaymentLinkType[];
  compositionKinds: readonly PaymentLinkV2CompositionKind[];
  search?: string;
  // Additive: the exact currency-pair id from the `pair` filter, and the
  // inclusive/exclusive calendar-day bounds from `from`/`to` (already
  // grammar-validated by the query resolver before this window ever runs).
  currencyPairId?: string;
  createdFrom?: Date;
  createdBefore?: Date;
  direction: "forward" | "backward";
  seek?: Readonly<{ createdAtMs: number; id: string }>;
  limit: number;
  now: Date;
}>;

export type PaymentLinkV2ViewStore = Readonly<{
  listWindow(query: PaymentLinkV2WindowQuery): Promise<StoredPaymentLinkV2View[]>;
  findForOwner(ownerId: string, id: string): Promise<StoredPaymentLinkV2OwnerDetail | null>;
  // Additive, owner-scoped: the order detail's link card resolves its own
  // link by the 24-character public identifier the order carries, never by
  // the internal UUID.
  findForOwnerByIdentifier(ownerId: string, identifier: string): Promise<StoredPaymentLinkV2View | null>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LINK_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;
const LINK_TYPES = ["SINGLE_USE", "REUSABLE"] as const satisfies readonly PaymentLinkType[];
const COMPOSITION_KINDS = ["PRODUCT_LINES", "FIXED_AMOUNT"] as const satisfies readonly PaymentLinkV2CompositionKind[];

// Precedence is the closed vocabulary's reading order: an owner-deactivated
// link is inactive; read-time expiry applies only to an active link; a link
// with its confirmed settlement is paid; anything else is active.
export function derivePaymentLinkV2State(
  link: Readonly<{ active: boolean; expiresAt: Date | null; paid: boolean }>,
  now: Date,
): PaymentLinkV2DerivedState {
  if (!link.active) return "inactive";
  if (link.expiresAt !== null && link.expiresAt.getTime() <= now.getTime()) return "expired";
  if (link.paid) return "paid";
  return "active";
}

// Generic over the stored shape so the one `findForOwner`-only additive
// projection (`StoredPaymentLinkV2OwnerDetail`) rides the same conversion as
// the base `listWindow`/administrator shape, with zero signature change for
// either existing caller.
export function toPaymentLinkV2DirectoryRow<T extends StoredPaymentLinkV2View>(
  stored: T,
  now: Date,
): T & Readonly<{ sharePath: string; state: PaymentLinkV2DerivedState }> {
  return {
    ...stored,
    sharePath: `/pay/${stored.identifier}`,
    state: derivePaymentLinkV2State(stored, now),
  };
}

// The keyset tuple is the read-time `(createdAt, id)` pair in epoch
// milliseconds plus the immutable UUID; anything else is an invalid cursor.
export function validatePaymentLinkV2DirectoryTuple(tuple: readonly (string | number | boolean | null)[]) {
  return (
    tuple.length === 2
    && typeof tuple[0] === "number"
    && Number.isSafeInteger(tuple[0])
    && tuple[0] >= 0
    && typeof tuple[1] === "string"
    && UUID_PATTERN.test(tuple[1])
  );
}

function readEnumFilter<T extends string>(
  value: string | readonly string[] | undefined,
  allowed: readonly T[],
): readonly T[] {
  const values = typeof value === "string" ? [value] : value ?? [];
  return values.filter((entry): entry is T => (allowed as readonly string[]).includes(entry));
}

function firstFilterValue(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.[0];
}

const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// Exact UTC calendar-day start, or `null` for an ungrammatical or
// nonexistent day; the query resolver rejects the latter before this window
// ever runs, so a caller reaching this function always passes a valid day.
function calendarDayStartUtc(value: string): Date | null {
  const match = CALENDAR_DAY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, month - 1, day));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return null;
  return start;
}

export { calendarDayStartUtc as validCalendarDayStartUtc };

export function createPaymentLinkV2DirectoryAdapter(
  store: PaymentLinkV2ViewStore,
  now: () => Date = () => new Date(),
): DirectoryAdapter<PaymentLinkV2DirectoryRow> {
  return {
    async readWindow(input: DirectoryReadInput<PaymentLinkV2DirectoryRow>) {
      if (input.scope.purpose !== "MERCHANT_OWN") {
        throw new Error("A merchant-own scope is required for the payment-link directory");
      }
      let seek: PaymentLinkV2WindowQuery["seek"];
      if (input.seek !== undefined) {
        if (!validatePaymentLinkV2DirectoryTuple(input.seek)) {
          throw new Error("Invalid payment-link directory cursor tuple");
        }
        seek = { createdAtMs: input.seek[0] as number, id: (input.seek[1] as string).toLowerCase() };
      }
      const search = typeof input.filters.q === "string" && input.filters.q !== "" ? input.filters.q : undefined;
      const pair = firstFilterValue(input.filters.pair);
      const from = firstFilterValue(input.filters.from);
      const to = firstFilterValue(input.filters.to);
      const createdFrom = from ? calendarDayStartUtc(from) : null;
      const createdToStart = to ? calendarDayStartUtc(to) : null;
      const stored = await store.listWindow({
        ownerId: input.scope.ownerId,
        states: readEnumFilter(input.filters.state, PAYMENT_LINK_V2_DERIVED_STATES),
        linkTypes: readEnumFilter(input.filters.type, LINK_TYPES),
        compositionKinds: readEnumFilter(input.filters.kind, COMPOSITION_KINDS),
        ...(search ? { search } : {}),
        ...(pair ? { currencyPairId: pair } : {}),
        ...(createdFrom ? { createdFrom } : {}),
        ...(createdToStart ? { createdBefore: new Date(createdToStart.getTime() + 24 * 60 * 60 * 1000) } : {}),
        direction: input.direction,
        ...(seek ? { seek } : {}),
        limit: input.limit,
        now: now(),
      });
      const readAt = now();
      return stored.map((row) => toPaymentLinkV2DirectoryRow(row, readAt));
    },
  };
}

export function createPaymentLinkV2ViewService(
  store: PaymentLinkV2ViewStore,
  now: () => Date = () => new Date(),
) {
  return {
    async getForOwner(actor: Principal, id: unknown): Promise<PaymentLinkV2ViewResult> {
      requireUserPrincipal(actor);
      if (typeof id !== "string" || !UUID_PATTERN.test(id)) return { kind: "unavailable" };
      const stored = await store.findForOwner(actor.id, id.toLowerCase());
      return stored
        ? { kind: "found", link: toPaymentLinkV2DirectoryRow(stored, now()) }
        : { kind: "unavailable" };
    },
    // Additive, consumed by the order detail's link card (14.5.1): re-authorized
    // owner, owner-scoped by identifier, one opaque unavailable outcome for a
    // malformed or missing 24-character identifier or a cross-owner link.
    async getForOwnerByIdentifier(actor: Principal, identifier: unknown): Promise<PaymentLinkV2ViewResult> {
      requireUserPrincipal(actor);
      if (typeof identifier !== "string" || !LINK_IDENTIFIER_PATTERN.test(identifier)) return { kind: "unavailable" };
      const stored = await store.findForOwnerByIdentifier(actor.id, identifier);
      return stored
        ? { kind: "found", link: toPaymentLinkV2DirectoryRow(stored, now()) }
        : { kind: "unavailable" };
    },
  };
}

const viewSelect = {
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
  // Filtered relation count rides the (payment_link_v2_id, created_at, id)
  // index; one bounded count per listed link, never a stored column.
  _count: { select: { orders: { where: { source: "LINK" } } } },
} satisfies Prisma.PaymentLinkV2Select;

type PrismaPaymentLinkV2ViewRow = {
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
};

function toStored(row: PrismaPaymentLinkV2ViewRow): StoredPaymentLinkV2View {
  return {
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
    // Paid is the type-conditional confirmed settlement: the single-use claim
    // row for SINGLE_USE, at least one CONFIRMED LINK order for REUSABLE.
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
  };
}

// The derived-state filter mirrors derivePaymentLinkV2State exactly, so a
// state selection returns precisely the rows whose read-time state matches.
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

function windowWhere(query: PaymentLinkV2WindowQuery): Prisma.PaymentLinkV2WhereInput {
  const and: Prisma.PaymentLinkV2WhereInput[] = [];
  if (query.compositionKinds.length > 0) and.push({ compositionKind: { in: [...query.compositionKinds] } });
  if (query.linkTypes.length > 0) and.push({ linkType: { in: [...query.linkTypes] } });
  if (query.states.length > 0) and.push({ OR: query.states.map((state) => stateCondition(state, query.now)) });
  if (query.currencyPairId) and.push({ currencyPairId: query.currencyPairId });
  if (query.createdFrom || query.createdBefore) {
    and.push({
      createdAt: {
        ...(query.createdFrom ? { gte: query.createdFrom } : {}),
        ...(query.createdBefore ? { lt: query.createdBefore } : {}),
      },
    });
  }
  if (query.search) {
    and.push({
      OR: [
        { identifier: { contains: query.search, mode: "insensitive" } },
        { descriptionPtBr: { contains: query.search, mode: "insensitive" } },
        { descriptionEn: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }
  if (query.seek) {
    const createdAt = new Date(query.seek.createdAtMs);
    and.push({
      OR: query.direction === "forward"
        ? [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: query.seek.id } }]
        : [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: query.seek.id } }],
    });
  }
  return and.length === 0 ? { ownerId: query.ownerId } : { ownerId: query.ownerId, AND: and };
}

// `findForOwner`-only select: the same base projection plus every confirmed
// LINK order's exact amount (not just the first, unlike the `paid`-flag probe
// above) and each line's product `active` flag.
const ownerDetailSelect = {
  ...viewSelect,
  lines: {
    select: {
      position: true,
      quantity: true,
      product: { select: { titlePtBr: true, titleEn: true, price: true, active: true } },
    },
    orderBy: { position: "asc" as const },
  },
  orders: { where: { source: "LINK", state: "CONFIRMED" }, select: { id: true, amount: true } },
} satisfies Prisma.PaymentLinkV2Select;

type PrismaPaymentLinkV2OwnerDetailRow = Omit<PrismaPaymentLinkV2ViewRow, "lines" | "orders"> & {
  lines: Array<{
    position: number;
    quantity: number;
    product: { titlePtBr: string; titleEn: string; price: string; active: boolean };
  }>;
  orders: Array<{ id: string; amount: string }>;
};

const MICRO_UNIT_SCALE = BigInt(1_000_000);
const MICRO_UNIT_DIGITS = 6;

// The store's own exact-decimal sum for the confirmed volume: independent of
// the client-safe `link-money.ts` module the app pages use, since this layer
// never imports from `src/app/**`.
function sumExactAmounts(amounts: readonly string[]): string {
  const total = amounts.reduce((sum, amount) => {
    const [integerPart, fractionPart = ""] = amount.split(".");
    const fraction = fractionPart.padEnd(MICRO_UNIT_DIGITS, "0");
    return sum + BigInt(integerPart) * MICRO_UNIT_SCALE + BigInt(fraction || "0");
  }, BigInt(0));
  const integer = total / MICRO_UNIT_SCALE;
  const fraction = (total % MICRO_UNIT_SCALE).toString().padStart(MICRO_UNIT_DIGITS, "0").replace(/0+$/, "");
  return fraction === "" ? integer.toString() : `${integer}.${fraction}`;
}

function toOwnerDetailStored(row: PrismaPaymentLinkV2OwnerDetailRow): StoredPaymentLinkV2OwnerDetail {
  return {
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
      available: line.product.active,
    })),
    confirmedOrderCount: row.orders.length,
    confirmedVolume: sumExactAmounts(row.orders.map((order) => order.amount)),
  };
}

function createPrismaPaymentLinkV2ViewStore(prisma: PrismaClient): PaymentLinkV2ViewStore {
  return {
    async listWindow(query) {
      const rows = await prisma.paymentLinkV2.findMany({
        where: windowWhere(query),
        orderBy: query.direction === "forward"
          ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
          : [{ createdAt: "asc" as const }, { id: "asc" as const }],
        take: query.limit,
        select: viewSelect,
      });
      return rows.map((row) => toStored(row as unknown as PrismaPaymentLinkV2ViewRow));
    },
    async findForOwner(ownerId, id) {
      const row = await prisma.paymentLinkV2.findFirst({ where: { id, ownerId }, select: ownerDetailSelect });
      return row ? toOwnerDetailStored(row as unknown as PrismaPaymentLinkV2OwnerDetailRow) : null;
    },
    async findForOwnerByIdentifier(ownerId, identifier) {
      const row = await prisma.paymentLinkV2.findFirst({ where: { identifier, ownerId }, select: viewSelect });
      return row ? toStored(row as unknown as PrismaPaymentLinkV2ViewRow) : null;
    },
  };
}

function createDefaultStore() {
  return createPrismaPaymentLinkV2ViewStore(getDatabaseClient());
}

export function getPaymentLinkV2ViewService() {
  return createPaymentLinkV2ViewService(createDefaultStore());
}

export function getPaymentLinkV2DirectoryAdapter() {
  return createPaymentLinkV2DirectoryAdapter(createDefaultStore());
}

export type PaymentLinkV2OwnerCurrencyPairOption = Readonly<{ id: string; label: string }>;

// The owner's active pairs for the additive `pair` directory filter: the
// distinct currency pairs actually used across this owner's V2 links, never
// the full catalog registry — so every registered option always matches at
// least one row.
export async function listOwnerActiveCurrencyPairs(ownerId: string): Promise<PaymentLinkV2OwnerCurrencyPairOption[]> {
  const prisma = getDatabaseClient();
  const rows = await prisma.paymentLinkV2.findMany({
    where: { ownerId },
    distinct: ["currencyPairId"],
    select: { currencyPairId: true, currencyPair: { select: { label: true } } },
  });
  return rows
    .map((row) => ({ id: row.currencyPairId, label: row.currencyPair.label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

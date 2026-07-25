import "server-only";

import type {
  DirectoryAdapter,
  DirectoryReadInput,
} from "../data-directory/server/directory-page";
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

export const PAYMENT_LINK_V2_DIRECTORY_FILTER_DEFINITIONS = [
  { name: "state", kind: "enum", values: PAYMENT_LINK_V2_DERIVED_STATES },
  { name: "type", kind: "enum", values: ["SINGLE_USE", "REUSABLE"] },
  { name: "kind", kind: "enum", values: ["PRODUCT_LINES", "FIXED_AMOUNT"] },
] as const;

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
  state: PaymentLinkV2DerivedState;
  createdAt: Date;
  updatedAt: Date;
  lines: ReadonlyArray<PaymentLinkV2LineSummary>;
}>;

export type PaymentLinkV2View = PaymentLinkV2DirectoryRow;

// Cross-owner, malformed, and missing link identities share this one outcome.
export type PaymentLinkV2ViewResult =
  | Readonly<{ kind: "found"; link: PaymentLinkV2View }>
  | Readonly<{ kind: "unavailable" }>;

export type StoredPaymentLinkV2View = Omit<PaymentLinkV2DirectoryRow, "sharePath" | "state">;

export type PaymentLinkV2WindowQuery = Readonly<{
  ownerId: string;
  states: readonly PaymentLinkV2DerivedState[];
  linkTypes: readonly PaymentLinkType[];
  compositionKinds: readonly PaymentLinkV2CompositionKind[];
  search?: string;
  direction: "forward" | "backward";
  seek?: Readonly<{ createdAtMs: number; id: string }>;
  limit: number;
  now: Date;
}>;

export type PaymentLinkV2ViewStore = Readonly<{
  listWindow(query: PaymentLinkV2WindowQuery): Promise<StoredPaymentLinkV2View[]>;
  findForOwner(ownerId: string, id: string): Promise<StoredPaymentLinkV2View | null>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

export function toPaymentLinkV2DirectoryRow(stored: StoredPaymentLinkV2View, now: Date): PaymentLinkV2DirectoryRow {
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
      const stored = await store.listWindow({
        ownerId: input.scope.ownerId,
        states: readEnumFilter(input.filters.state, PAYMENT_LINK_V2_DERIVED_STATES),
        linkTypes: readEnumFilter(input.filters.type, LINK_TYPES),
        compositionKinds: readEnumFilter(input.filters.kind, COMPOSITION_KINDS),
        ...(search ? { search } : {}),
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
      const row = await prisma.paymentLinkV2.findFirst({ where: { id, ownerId }, select: viewSelect });
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

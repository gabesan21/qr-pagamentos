import "server-only";

import { ForbiddenError, requireUserPrincipal, type Principal } from "../auth/authorization";
import { getDatabaseClient } from "../db/client";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import type { CheckoutDataPolicy, CustomerAddressV1, CustomerSnapshotV1 } from "./payment-link-order";
import type { OrderV2LineSnapshot, OrderV2LocalOutcome, OrderV2Source, OrderV2State } from "./order-v2";

// Bounded recent window; pagination beyond it is intentionally out of scope.
export const ORDER_V2_VIEW_LIST_LIMIT = 50;

export type OrderV2LocalOutcomeView = Readonly<{
  outcome: OrderV2LocalOutcome;
  note: string | null;
  createdAt: Date;
}>;

export type OrderV2CommentView = Readonly<{
  id: string;
  body: string;
  version: number;
  createdAt: Date;
  editedAt: Date | null;
}>;

export type OrderV2Summary = Readonly<{
  id: string;
  source: OrderV2Source;
  paymentLinkV2Identifier: string | null;
  amount: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  // `state` and the current local outcome are separate fields: a local outcome
  // never writes, masks, or shadows the authoritative payment state.
  state: OrderV2State | null;
  currentLocalOutcome: OrderV2LocalOutcomeView | null;
  checkoutDataPolicy: CheckoutDataPolicy;
  createdAt: Date;
  updatedAt: Date;
  settledAt: Date | null;
}>;

export type OrderV2View = OrderV2Summary & Readonly<{
  customer: CustomerSnapshotV1;
  lines: ReadonlyArray<OrderV2LineSnapshot>;
  comments: ReadonlyArray<OrderV2CommentView>;
}>;

// Cross-owner, malformed, and missing order identities share this one outcome.
export type OrderV2ViewResult = Readonly<{ kind: "found"; order: OrderV2View }> | Readonly<{ kind: "unavailable" }>;

type StoredCustomerColumns = Readonly<{
  name: string | null;
  email: string | null;
  cpf: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  stateUf: string | null;
  postalCode: string | null;
  country: string | null;
  complement: string | null;
}>;

export type StoredOrderV2View = Omit<OrderV2Summary, "currentLocalOutcome"> & StoredCustomerColumns & Readonly<{
  lines: ReadonlyArray<OrderV2LineSnapshot>;
  comments: ReadonlyArray<OrderV2CommentView>;
  latestLocalOutcome: OrderV2LocalOutcomeView | null;
}>;

export type OrderV2ViewStore = Readonly<{
  listForOwner(ownerId: string, limit: number): Promise<StoredOrderV2View[]>;
  listGlobal(limit: number): Promise<StoredOrderV2View[]>;
  findForOwner(ownerId: string, orderId: string): Promise<StoredOrderV2View | null>;
  findGlobal(orderId: string): Promise<StoredOrderV2View | null>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function opaqueUnavailable(): OrderV2ViewResult {
  return { kind: "unavailable" };
}

function requireAdministrator(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

function storedAddress(stored: StoredCustomerColumns): CustomerAddressV1 | null {
  if (!stored.street || !stored.number || !stored.district || !stored.city || !stored.stateUf || !stored.postalCode || stored.country !== "BR") return null;
  return {
    street: stored.street,
    number: stored.number,
    district: stored.district,
    city: stored.city,
    stateUf: stored.stateUf,
    postalCode: stored.postalCode,
    country: "BR",
    complement: stored.complement,
  };
}

// The projection exposes exactly the policy tuple, even if stray columns were
// persisted; a persisted policy outside the closed enum fails closed to blank.
export function toPolicySnapshotV2(policy: CheckoutDataPolicy, stored: StoredCustomerColumns): CustomerSnapshotV1 {
  const blank: CustomerSnapshotV1 = { name: null, email: null, cpf: null, address: null };
  if (policy === "NONE") return blank;
  if (policy === "EMAIL") return { ...blank, email: stored.email };
  if (policy === "NAME_EMAIL") return { ...blank, name: stored.name, email: stored.email };
  if (policy === "NAME_EMAIL_CPF") return { ...blank, name: stored.name, email: stored.email, cpf: stored.cpf };
  if (policy === "NAME_EMAIL_CPF_ADDRESS") return { name: stored.name, email: stored.email, cpf: stored.cpf, address: storedAddress(stored) };
  return blank;
}

function toSummary(stored: StoredOrderV2View): OrderV2Summary {
  const { name, email, cpf, street, number, district, city, stateUf, postalCode, country, complement, lines, comments, latestLocalOutcome, ...summary } = stored;
  return { ...summary, currentLocalOutcome: latestLocalOutcome };
}

function toOrderV2View(stored: StoredOrderV2View): OrderV2View {
  return {
    ...toSummary(stored),
    customer: toPolicySnapshotV2(stored.checkoutDataPolicy, stored),
    lines: stored.lines,
    comments: stored.comments,
  };
}

export type OrderV2SummaryRow = PrismaOrderV2Row;

// Summary-only mapping shared with the owner order directory query (8.3.1).
export function toOrderV2Summary(row: OrderV2SummaryRow): OrderV2Summary {
  return toSummary(toStored(row));
}

export function createOrderV2ViewService(store: OrderV2ViewStore) {
  return {
    async listForOwner(actor: Principal): Promise<OrderV2Summary[]> {
      requireUserPrincipal(actor);
      const stored = await store.listForOwner(actor.id, ORDER_V2_VIEW_LIST_LIMIT);
      return stored.map(toSummary);
    },
    async listForAdmin(actor: Principal): Promise<OrderV2Summary[]> {
      requireAdministrator(actor);
      const stored = await store.listGlobal(ORDER_V2_VIEW_LIST_LIMIT);
      return stored.map(toSummary);
    },
    async getForOwner(actor: Principal, orderId: unknown): Promise<OrderV2ViewResult> {
      requireUserPrincipal(actor);
      if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) return opaqueUnavailable();
      const stored = await store.findForOwner(actor.id, orderId.toLowerCase());
      return stored ? { kind: "found", order: toOrderV2View(stored) } : opaqueUnavailable();
    },
    async getForAdmin(actor: Principal, orderId: unknown): Promise<OrderV2ViewResult> {
      requireAdministrator(actor);
      if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) return opaqueUnavailable();
      const stored = await store.findGlobal(orderId.toLowerCase());
      return stored ? { kind: "found", order: toOrderV2View(stored) } : opaqueUnavailable();
    },
  };
}

const summarySelect = {
  id: true,
  source: true,
  state: true,
  amount: true,
  currencyUuid: true,
  exchangeCurrencyUuid: true,
  descriptionPtBr: true,
  descriptionEn: true,
  checkoutDataPolicy: true,
  createdAt: true,
  updatedAt: true,
  settledAt: true,
  paymentLink: { select: { identifier: true } },
  localOutcomes: { select: { outcome: true, note: true, createdAt: true }, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: 1 },
} satisfies Prisma.OrderV2Select;

// Shared with the owner order directory query (8.3.1) so the summary projection
// stays single-sourced.
export const orderV2SummarySelect = summarySelect;

const customerSelect = {
  name: true, email: true, cpf: true, street: true, number: true, district: true,
  city: true, stateUf: true, postalCode: true, country: true, complement: true,
} satisfies Prisma.OrderV2Select;

const detailSelect = {
  ...summarySelect,
  ...customerSelect,
  lines: { select: { productId: true, position: true, quantity: true, unitPrice: true }, orderBy: { position: "asc" } },
  comments: { select: { id: true, body: true, version: true, createdAt: true, editedAt: true }, orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
} satisfies Prisma.OrderV2Select;

type PrismaOrderV2Row = {
  id: string;
  source: string;
  state: string | null;
  amount: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  checkoutDataPolicy: string;
  createdAt: Date;
  updatedAt: Date;
  settledAt: Date | null;
  paymentLink: { identifier: string } | null;
  localOutcomes: Array<{ outcome: string; note: string | null; createdAt: Date }>;
  lines?: Array<OrderV2LineSnapshot>;
  comments?: Array<OrderV2CommentView>;
} & Partial<StoredCustomerColumns>;

function toStored(row: PrismaOrderV2Row): StoredOrderV2View {
  return {
    id: row.id,
    source: row.source as OrderV2Source,
    paymentLinkV2Identifier: row.paymentLink?.identifier ?? null,
    amount: row.amount,
    currencyUuid: row.currencyUuid,
    exchangeCurrencyUuid: row.exchangeCurrencyUuid,
    descriptionPtBr: row.descriptionPtBr,
    descriptionEn: row.descriptionEn,
    state: row.state as OrderV2State | null,
    checkoutDataPolicy: row.checkoutDataPolicy as CheckoutDataPolicy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    settledAt: row.settledAt,
    name: row.name ?? null,
    email: row.email ?? null,
    cpf: row.cpf ?? null,
    street: row.street ?? null,
    number: row.number ?? null,
    district: row.district ?? null,
    city: row.city ?? null,
    stateUf: row.stateUf ?? null,
    postalCode: row.postalCode ?? null,
    country: row.country ?? null,
    complement: row.complement ?? null,
    lines: row.lines ?? [],
    comments: row.comments ?? [],
    latestLocalOutcome: row.localOutcomes[0]
      ? { outcome: row.localOutcomes[0].outcome as OrderV2LocalOutcome, note: row.localOutcomes[0].note, createdAt: row.localOutcomes[0].createdAt }
      : null,
  };
}

function createPrismaOrderV2ViewStore(prisma: PrismaClient): OrderV2ViewStore {
  return {
    async listForOwner(ownerId, limit) {
      const rows = await prisma.orderV2.findMany({ where: { ownerId }, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: limit, select: summarySelect });
      return rows.map((row) => toStored(row as PrismaOrderV2Row));
    },
    async listGlobal(limit) {
      const rows = await prisma.orderV2.findMany({ orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: limit, select: summarySelect });
      return rows.map((row) => toStored(row as PrismaOrderV2Row));
    },
    async findForOwner(ownerId, orderId) {
      const row = await prisma.orderV2.findFirst({ where: { id: orderId, ownerId }, select: detailSelect });
      return row ? toStored(row as unknown as PrismaOrderV2Row) : null;
    },
    async findGlobal(orderId) {
      const row = await prisma.orderV2.findFirst({ where: { id: orderId }, select: detailSelect });
      return row ? toStored(row as unknown as PrismaOrderV2Row) : null;
    },
  };
}

export function getOrderV2ViewService() {
  return createOrderV2ViewService(createPrismaOrderV2ViewStore(getDatabaseClient()));
}

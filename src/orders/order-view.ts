import "server-only";

import { ForbiddenError, requireUserPrincipal, type Principal } from "../auth/authorization";
import { getDatabaseClient } from "../db/client";
import type { PrismaClient } from "../generated/prisma/client";
import type { CheckoutDataPolicy, CustomerAddressV1, CustomerSnapshotV1, PaymentLinkOrderState } from "./payment-link-order";

// Bounded recent window; pagination beyond it is intentionally out of scope.
export const ORDER_VIEW_LIST_LIMIT = 50;

export type OrderSummary = Readonly<{
  id: string;
  paymentLinkIdentifier: string;
  productTitlePtBr: string;
  productTitleEn: string;
  amount: string;
  currencyPairLabel: string;
  state: PaymentLinkOrderState;
  checkoutDataPolicy: CheckoutDataPolicy;
  createdAt: Date;
  updatedAt: Date;
  settledAt: Date | null;
}>;

export type OrderView = OrderSummary & Readonly<{ customer: CustomerSnapshotV1 }>;

// Cross-owner, malformed, and missing order identities share this one outcome.
export type OrderViewResult = Readonly<{ kind: "found"; order: OrderView }> | Readonly<{ kind: "unavailable" }>;

export type StoredOrderView = OrderSummary & Readonly<{
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

export type OrderViewStore = Readonly<{
  listForOwner(ownerId: string, limit: number): Promise<OrderSummary[]>;
  listGlobal(limit: number): Promise<OrderSummary[]>;
  findForOwner(ownerId: string, orderId: string): Promise<StoredOrderView | null>;
  findGlobal(orderId: string): Promise<StoredOrderView | null>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function opaqueUnavailable(): OrderViewResult {
  return { kind: "unavailable" };
}

function requireAdministrator(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

function storedAddress(stored: StoredOrderView): CustomerAddressV1 | null {
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

// The projection exposes exactly the policy tuple, even if stray columns were persisted.
// Fail-closed: a persisted policy outside the closed enum exposes no customer data.
export function toPolicySnapshot(policy: CheckoutDataPolicy, stored: StoredOrderView): CustomerSnapshotV1 {
  const blank: CustomerSnapshotV1 = { name: null, email: null, cpf: null, address: null };
  if (policy === "NONE") return blank;
  if (policy === "EMAIL") return { ...blank, email: stored.email };
  if (policy === "NAME_EMAIL") return { ...blank, name: stored.name, email: stored.email };
  if (policy === "NAME_EMAIL_CPF") return { ...blank, name: stored.name, email: stored.email, cpf: stored.cpf };
  if (policy === "NAME_EMAIL_CPF_ADDRESS") return { name: stored.name, email: stored.email, cpf: stored.cpf, address: storedAddress(stored) };
  return blank;
}

function toOrderView(stored: StoredOrderView): OrderView {
  const { name, email, cpf, street, number, district, city, stateUf, postalCode, country, complement, ...summary } = stored;
  return { ...summary, customer: toPolicySnapshot(stored.checkoutDataPolicy, stored) };
}

export function createOrderViewService(store: OrderViewStore) {
  return {
    async listForOwner(actor: Principal): Promise<OrderSummary[]> {
      requireUserPrincipal(actor);
      return store.listForOwner(actor.id, ORDER_VIEW_LIST_LIMIT);
    },
    async listForAdmin(actor: Principal): Promise<OrderSummary[]> {
      requireAdministrator(actor);
      return store.listGlobal(ORDER_VIEW_LIST_LIMIT);
    },
    async getForOwner(actor: Principal, orderId: unknown): Promise<OrderViewResult> {
      requireUserPrincipal(actor);
      if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) return opaqueUnavailable();
      const stored = await store.findForOwner(actor.id, orderId.toLowerCase());
      return stored ? { kind: "found", order: toOrderView(stored) } : opaqueUnavailable();
    },
    async getForAdmin(actor: Principal, orderId: unknown): Promise<OrderViewResult> {
      requireAdministrator(actor);
      if (typeof orderId !== "string" || !UUID_PATTERN.test(orderId)) return opaqueUnavailable();
      const stored = await store.findGlobal(orderId.toLowerCase());
      return stored ? { kind: "found", order: toOrderView(stored) } : opaqueUnavailable();
    },
  };
}

type PrismaOrderRow = Omit<OrderSummary, "state" | "checkoutDataPolicy"> & { state: string; checkoutDataPolicy: string };

function createPrismaOrderViewStore(prisma: PrismaClient): OrderViewStore {
  const summarySelect = {
    id: true,
    productPrice: true,
    state: true,
    checkoutDataPolicy: true,
    createdAt: true,
    updatedAt: true,
    settledAt: true,
    paymentLink: { select: { identifier: true, currencyPair: { select: { label: true } } } },
    product: { select: { titlePtBr: true, titleEn: true } },
  } as const;
  const customerSelect = {
    name: true, email: true, cpf: true, street: true, number: true, district: true,
    city: true, stateUf: true, postalCode: true, country: true, complement: true,
  } as const;
  function toSummary(row: { id: string; productPrice: string; state: string; checkoutDataPolicy: string; createdAt: Date; updatedAt: Date; settledAt: Date | null; paymentLink: { identifier: string; currencyPair: { label: string } }; product: { titlePtBr: string; titleEn: string } }): PrismaOrderRow {
    return {
      id: row.id,
      paymentLinkIdentifier: row.paymentLink.identifier,
      productTitlePtBr: row.product.titlePtBr,
      productTitleEn: row.product.titleEn,
      amount: row.productPrice,
      currencyPairLabel: row.paymentLink.currencyPair.label,
      state: row.state,
      checkoutDataPolicy: row.checkoutDataPolicy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      settledAt: row.settledAt,
    };
  }
  return {
    async listForOwner(ownerId, limit) {
      const rows = await prisma.paymentLinkOrder.findMany({ where: { ownerId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, select: summarySelect });
      return rows.map((row) => toSummary(row) as OrderSummary);
    },
    async listGlobal(limit) {
      const rows = await prisma.paymentLinkOrder.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, select: summarySelect });
      return rows.map((row) => toSummary(row) as OrderSummary);
    },
    async findForOwner(ownerId, orderId) {
      const row = await prisma.paymentLinkOrder.findFirst({ where: { id: orderId, ownerId }, select: { ...summarySelect, ...customerSelect } });
      if (!row) return null;
      const { name, email, cpf, street, number, district, city, stateUf, postalCode, country, complement } = row;
      return { ...toSummary(row), name, email, cpf, street, number, district, city, stateUf, postalCode, country, complement } as StoredOrderView;
    },
    async findGlobal(orderId) {
      const row = await prisma.paymentLinkOrder.findFirst({ where: { id: orderId }, select: { ...summarySelect, ...customerSelect } });
      if (!row) return null;
      const { name, email, cpf, street, number, district, city, stateUf, postalCode, country, complement } = row;
      return { ...toSummary(row), name, email, cpf, street, number, district, city, stateUf, postalCode, country, complement } as StoredOrderView;
    },
  };
}

export function getOrderViewService() {
  return createOrderViewService(createPrismaOrderViewStore(getDatabaseClient()));
}

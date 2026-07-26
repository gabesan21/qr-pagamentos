import "server-only";

import { randomUUID } from "node:crypto";

import { requireUserPrincipal, type Principal } from "../auth/authorization";
import { getDatabaseClient } from "../db/client";
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import {
  CHECKOUT_DATA_POLICIES,
  normalizeCustomerSnapshotV1,
  type CheckoutDataPolicy,
  type CustomerSnapshotV1,
  type PaymentLinkOrderState,
} from "./payment-link-order";

// The source vocabulary and its link/state coherence are service-fenced: the
// safe migration language cannot express a droppable closed-set check on
// `source` or a "present exactly when" invariant, so every write path below is
// the only place `LINK`/`AD_HOC`/`STANDALONE` rows are shaped.
export const ORDER_V2_SOURCES = ["LINK", "AD_HOC", "STANDALONE"] as const;
export type OrderV2Source = (typeof ORDER_V2_SOURCES)[number];
export type OrderV2State = PaymentLinkOrderState;

// STANDALONE orders carry the V1 state vocabulary, hold no link and no lines,
// and snapshot this fixed server-side bilingual description pair — never
// browser-supplied text.
export const STANDALONE_ORDER_DESCRIPTION = {
  ptBr: "Pagamento avulso",
  en: "Standalone payment",
} as const;

export const ORDER_V2_LOCAL_OUTCOMES = ["LOCAL_FINALIZED", "LOCAL_CANCELLED"] as const;
export type OrderV2LocalOutcome = (typeof ORDER_V2_LOCAL_OUTCOMES)[number];

export type OrderV2LineSnapshot = Readonly<{
  productId: string;
  position: number;
  quantity: number;
  unitPrice: string;
}>;

export type StoredOrderV2 = Readonly<{
  id: string;
  ownerId: string;
  source: OrderV2Source;
  paymentLinkV2Id: string | null;
  state: OrderV2State | null;
  lifecycleVersion: number;
  amount: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  checkoutDataPolicy: CheckoutDataPolicy;
  lines: ReadonlyArray<OrderV2LineSnapshot>;
}>;

export type SettlementInputV2 = Readonly<{
  ownerId: string;
  orderV2Id: string;
  providerOrderId: string;
  providerOrderUuid: string;
  observedProviderReconciliationVersion: number;
  observedLocalLifecycleVersion: number;
  authoritativeProviderStatus: string;
}>;

export type ValidatedSettlementInputV2 = Omit<SettlementInputV2, "authoritativeProviderStatus"> & {
  readonly authoritativeProviderStatus: AuthoritativeProviderStatus;
};

type AuthoritativeProviderStatus = "new" | "processing" | "paid" | "finished" | "rejected" | "canceled" | "expired" | "refunded";

export type CreateAdHocOrderResult = Readonly<{ kind: "created"; order: StoredOrderV2 }>;
export type SettlementResultV2 = Readonly<{ kind: "settled"; state: OrderV2State }> | Readonly<{ kind: "no-op" }>;

export class OrderV2ValidationError extends Error {}
export class OrderV2DependencyError extends Error {}
export class OrderV2ConflictError extends Error {}

export type OrderV2Store = Readonly<{
  createAdHoc(ownerId: string, values: AdHocOrderValues & Readonly<{ id: string; createdAt: Date; updatedAt: Date }>): Promise<StoredOrderV2 | "dependency-unavailable">;
  createFromAvailableLink(paymentLinkV2Id: string, snapshot: CustomerSnapshotV1, identity: Readonly<{ id: string; createdAt: Date; updatedAt: Date }>): Promise<StoredOrderV2 | null>;
  settle(input: ValidatedSettlementInputV2, nextState: OrderV2State, settledAt: Date): Promise<SettlementResultV2>;
}>;

type AdHocOrderValues = Readonly<{
  amount: string;
  currencyPairId: string;
  descriptionPtBr: string;
  descriptionEn: string;
  checkoutDataPolicy: CheckoutDataPolicy;
  customer: CustomerSnapshotV1;
}>;

type Dependencies = Readonly<{
  now: () => Date;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Exactly the product-price grammar: canonical positive ASCII decimal, at most
// 12 integer and 6 fractional digits, never converted through Number.
const AMOUNT_PATTERN = /^(?:0\.[0-9]{0,5}[1-9]|[1-9][0-9]{0,11}(?:\.[0-9]{0,5}[1-9])?)$/;
const FRACTION_DIGITS = 6;
const FRACTION_SCALE = BigInt(10) ** BigInt(FRACTION_DIGITS);
const ZERO_UNITS = BigInt(0);
const AUTHORITATIVE_STATUSES = new Set<AuthoritativeProviderStatus>(["new", "processing", "paid", "finished", "rejected", "canceled", "expired", "refunded"]);
const activeDependencies: Dependencies = { now: () => new Date() };

function validateUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new OrderV2ValidationError(`${label} must be a canonical UUID`);
  }
  return value.toLowerCase();
}

function validateAmount(value: unknown): string {
  if (typeof value !== "string" || !AMOUNT_PATTERN.test(value)) {
    throw new OrderV2ValidationError("Amount must be a canonical positive decimal");
  }
  return value;
}

// Sessionless standalone checkout validates the browser-supplied amount against
// exactly the same canonical grammar, never through Number.
export function isCanonicalOrderAmount(value: unknown): value is string {
  return typeof value === "string" && AMOUNT_PATTERN.test(value);
}

function validateDescription(value: unknown, field: string): string {
  if (typeof value !== "string") throw new OrderV2ValidationError(`${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new OrderV2ValidationError(`${field} is required`);
  if (/[\r\n]/.test(trimmed)) throw new OrderV2ValidationError(`${field} must be single-line`);
  if ([...trimmed].length > 160) throw new OrderV2ValidationError(`${field} is too long`);
  return trimmed;
}

function validatePolicy(value: unknown): CheckoutDataPolicy {
  if (typeof value === "string" && (CHECKOUT_DATA_POLICIES as readonly string[]).includes(value)) {
    return value as CheckoutDataPolicy;
  }
  throw new OrderV2ValidationError("Checkout data policy is invalid");
}

function parseCustomer(value: unknown): unknown {
  if (typeof value !== "string") throw new OrderV2ValidationError("Customer snapshot is required");
  try {
    return JSON.parse(value);
  } catch {
    throw new OrderV2ValidationError("Customer snapshot is invalid");
  }
}

// Exact-decimal arithmetic on micro-units (10^6), never through Number.
function parseDecimalUnits(value: string): bigint {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer) * FRACTION_SCALE + BigInt((fraction + "000000").slice(0, FRACTION_DIGITS));
}

function formatDecimalUnits(units: bigint): string {
  const rendered = units.toString().padStart(FRACTION_DIGITS + 1, "0");
  const integer = rendered.slice(0, -FRACTION_DIGITS);
  const fraction = rendered.slice(-FRACTION_DIGITS).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer;
}

export function totalFromLines(lines: ReadonlyArray<Readonly<{ quantity: number; unitPrice: string }>>): string {
  let total = ZERO_UNITS;
  for (const line of lines) {
    total += parseDecimalUnits(line.unitPrice) * BigInt(line.quantity);
  }
  return formatDecimalUnits(total);
}

function mapSettlementStatus(status: AuthoritativeProviderStatus): OrderV2State {
  if (status === "new") return "PENDING";
  if (status === "processing" || status === "paid" || status === "finished") return "CONFIRMED";
  if (status === "rejected") return "REJECTED";
  if (status === "canceled") return "CANCELLED";
  if (status === "expired") return "EXPIRED";
  return "REFUNDED";
}

function validSettlementInput(value: SettlementInputV2): ValidatedSettlementInputV2 | null {
  if (!UUID_PATTERN.test(value.ownerId) || !UUID_PATTERN.test(value.orderV2Id) || !UUID_PATTERN.test(value.providerOrderId) || !UUID_PATTERN.test(value.providerOrderUuid)) return null;
  if (!Number.isSafeInteger(value.observedProviderReconciliationVersion) || value.observedProviderReconciliationVersion < 0 || !Number.isSafeInteger(value.observedLocalLifecycleVersion) || value.observedLocalLifecycleVersion < 0 || !AUTHORITATIVE_STATUSES.has(value.authoritativeProviderStatus as AuthoritativeProviderStatus)) return null;
  return { ...value, ownerId: value.ownerId.toLowerCase(), orderV2Id: value.orderV2Id.toLowerCase(), providerOrderId: value.providerOrderId.toLowerCase(), providerOrderUuid: value.providerOrderUuid.toLowerCase(), authoritativeProviderStatus: value.authoritativeProviderStatus as AuthoritativeProviderStatus };
}

function customerColumns(snapshot: CustomerSnapshotV1) {
  return {
    name: snapshot.name,
    email: snapshot.email,
    cpf: snapshot.cpf,
    street: snapshot.address?.street ?? null,
    number: snapshot.address?.number ?? null,
    district: snapshot.address?.district ?? null,
    city: snapshot.address?.city ?? null,
    stateUf: snapshot.address?.stateUf ?? null,
    postalCode: snapshot.address?.postalCode ?? null,
    country: snapshot.address?.country ?? null,
    complement: snapshot.address?.complement ?? null,
  };
}

export type StandaloneOrderRowValues = Readonly<{
  id: string;
  ownerId: string;
  amount: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  checkoutDataPolicy: CheckoutDataPolicy;
  customer: CustomerSnapshotV1;
  createdAt: Date;
  updatedAt: Date;
}>;

// Server-only STANDALONE creation seam: the only place standalone rows are
// shaped (no link, no lines, fixed bilingual description, V1 state vocabulary
// starting at CREATED). Called inside the sessionless checkout reservation
// transaction by src/checkout/standalone-checkout.ts — never from an owner
// route or with browser-derived owner/currency/description values.
export async function createStandaloneOrderRow(
  transaction: Prisma.TransactionClient,
  values: StandaloneOrderRowValues,
): Promise<void> {
  await transaction.orderV2.create({
    data: {
      id: values.id,
      ownerId: values.ownerId,
      source: "STANDALONE",
      paymentLinkV2Id: null,
      state: "CREATED",
      lifecycleVersion: 0,
      amount: values.amount,
      currencyUuid: values.currencyUuid,
      exchangeCurrencyUuid: values.exchangeCurrencyUuid,
      descriptionPtBr: STANDALONE_ORDER_DESCRIPTION.ptBr,
      descriptionEn: STANDALONE_ORDER_DESCRIPTION.en,
      checkoutDataPolicy: values.checkoutDataPolicy,
      ...customerColumns(values.customer),
      settledAt: null,
      createdAt: values.createdAt,
      updatedAt: values.updatedAt,
    },
  });
}

export function createOrderV2Service(store: OrderV2Store, dependencies: Dependencies = activeDependencies) {
  return {
    // AD_HOC orders are owner-only, stateless (no `state`, no link, no attempt,
    // no capability, no provider dispatch) under this contract.
    async createAdHoc(actor: Principal, input: Readonly<Record<string, unknown>>): Promise<CreateAdHocOrderResult> {
      requireUserPrincipal(actor);
      const checkoutDataPolicy = validatePolicy(input.checkoutDataPolicy);
      const customer = normalizeCustomerSnapshotV1(checkoutDataPolicy, parseCustomer(input.customer));
      if (!customer) throw new OrderV2ValidationError("Customer snapshot does not match the policy tuple");
      const values: AdHocOrderValues = {
        amount: validateAmount(input.amount),
        currencyPairId: validateUuid(input.currencyPairId, "Currency-pair identifier"),
        descriptionPtBr: validateDescription(input.descriptionPtBr, "Portuguese description"),
        descriptionEn: validateDescription(input.descriptionEn, "English description"),
        checkoutDataPolicy,
        customer,
      };
      const now = dependencies.now();
      const created = await store.createAdHoc(actor.id, { id: randomUUID(), createdAt: now, updatedAt: now, ...values });
      if (created === "dependency-unavailable") {
        throw new OrderV2DependencyError("Order dependency is unavailable");
      }
      return { kind: "created", order: created };
    },
    // Server-only LINK creation seam consumed by 9.3.1's public checkout; it is
    // never reachable from an owner route or a sessionless request in this task.
    async createFromLink(paymentLinkV2Id: unknown, snapshot: unknown): Promise<StoredOrderV2 | null> {
      if (typeof paymentLinkV2Id !== "string" || !UUID_PATTERN.test(paymentLinkV2Id)) return null;
      const now = dependencies.now();
      return store.createFromAvailableLink(paymentLinkV2Id.toLowerCase(), snapshot as CustomerSnapshotV1, { id: randomUUID(), createdAt: now, updatedAt: now });
    },
    // Server-only V2 settlement: the settlement map V1 and the versioned
    // reconciliation CAS rebound to V2 identities, with the atomic single-use
    // claim recorded before CONFIRMED in the V2 claim table. Link-less
    // STANDALONE orders settle through the same CAS with no claim.
    async settle(input: SettlementInputV2): Promise<SettlementResultV2> {
      const validated = validSettlementInput(input);
      return validated ? store.settle(validated, mapSettlementStatus(validated.authoritativeProviderStatus), dependencies.now()) : { kind: "no-op" };
    },
  };
}

type LockedLinkV2 = Readonly<{
  id: string;
  ownerId: string;
  compositionKind: string;
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  amount: string | null;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  checkoutDataPolicy: string;
}>;

type LockedLinkLine = Readonly<{
  productId: string;
  position: number;
  quantity: number;
  unitPrice: string;
}>;

type LockedSettlement = Readonly<{
  orderId: string;
  ownerId: string;
  paymentLinkV2Id: string | null;
  state: OrderV2State;
  lifecycleVersion: number;
}>;

const orderSelect = {
  id: true,
  ownerId: true,
  source: true,
  paymentLinkV2Id: true,
  state: true,
  lifecycleVersion: true,
  amount: true,
  currencyUuid: true,
  exchangeCurrencyUuid: true,
  descriptionPtBr: true,
  descriptionEn: true,
  checkoutDataPolicy: true,
  lines: { select: { productId: true, position: true, quantity: true, unitPrice: true }, orderBy: { position: "asc" } },
} as const;

type PrismaOrderV2 = Omit<StoredOrderV2, "source" | "state" | "checkoutDataPolicy"> & { source: string; state: string | null; checkoutDataPolicy: string };

function toStoredOrderV2(order: PrismaOrderV2): StoredOrderV2 {
  return {
    ...order,
    source: order.source as OrderV2Source,
    state: order.state as OrderV2State | null,
    checkoutDataPolicy: order.checkoutDataPolicy as CheckoutDataPolicy,
  };
}

function isEligibleTransition(current: OrderV2State, next: OrderV2State): boolean {
  if (current === next) return false;
  if (next === "REFUNDED") return current === "CONFIRMED";
  return current === "PENDING" || current === "INDETERMINATE";
}

function isUniqueConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "P2002";
}

async function pairActive(transaction: Prisma.TransactionClient, currencyPairId: string): Promise<boolean> {
  const pairs = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "app"."catalog_currency_pair"
    WHERE "id" = ${currencyPairId}::uuid AND "active" = true
    FOR SHARE
  `;
  return pairs.length === 1;
}

export function createOrderV2Store(prisma: PrismaClient): OrderV2Store {
  return {
    async createAdHoc(ownerId, values) {
      return prisma.$transaction(async (tx) => {
        if (!(await pairActive(tx, values.currencyPairId))) return "dependency-unavailable";
        const pair = await tx.catalogCurrencyPair.findFirst({ where: { id: values.currencyPairId }, select: { currencyUuid: true, exchangeCurrencyUuid: true } });
        if (!pair) return "dependency-unavailable";
        const order = await tx.orderV2.create({
          data: {
            id: values.id,
            ownerId,
            source: "AD_HOC",
            paymentLinkV2Id: null,
            state: null,
            lifecycleVersion: 0,
            amount: values.amount,
            currencyUuid: pair.currencyUuid,
            exchangeCurrencyUuid: pair.exchangeCurrencyUuid,
            descriptionPtBr: values.descriptionPtBr,
            descriptionEn: values.descriptionEn,
            checkoutDataPolicy: values.checkoutDataPolicy,
            ...customerColumns(values.customer),
            settledAt: null,
            createdAt: values.createdAt,
            updatedAt: values.updatedAt,
          },
          select: orderSelect,
        });
        return toStoredOrderV2(order as PrismaOrderV2);
      });
    },
    async createFromAvailableLink(paymentLinkV2Id, suppliedSnapshot, identity) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockedLinkV2[]>`
          SELECT l."id", l."owner_id" AS "ownerId", l."composition_kind" AS "compositionKind",
                 l."description_pt_br" AS "descriptionPtBr", l."description_en" AS "descriptionEn", l."amount",
                 c."currency_uuid" AS "currencyUuid", c."exchange_currency_uuid" AS "exchangeCurrencyUuid",
                 u."checkout_data_policy" AS "checkoutDataPolicy"
          FROM "app"."payment_link_v2" l
          JOIN "app"."catalog_currency_pair" c ON c."id" = l."currency_pair_id"
          JOIN "app"."user" u ON u."id" = l."owner_id"
          WHERE l."id" = ${paymentLinkV2Id}::uuid AND l."active" = true
            AND (l."expires_at" IS NULL OR l."expires_at" > CURRENT_TIMESTAMP)
          FOR UPDATE OF l, u
        `;
        const link = rows[0];
        if (!link) return null;
        const policy = link.checkoutDataPolicy as CheckoutDataPolicy;
        const snapshot = normalizeCustomerSnapshotV1(policy, suppliedSnapshot);
        if (!snapshot) return null;

        let amount: string;
        let lines: LockedLinkLine[] = [];
        if (link.compositionKind === "PRODUCT_LINES") {
          lines = await tx.$queryRaw<LockedLinkLine[]>`
            SELECT ll."product_id" AS "productId", ll."position", ll."quantity", p."price" AS "unitPrice"
            FROM "app"."payment_link_v2_line" ll
            JOIN "app"."product" p ON p."id" = ll."product_id" AND p."owner_id" = ll."owner_id" AND p."active" = true
            WHERE ll."payment_link_v2_id" = ${link.id}::uuid AND ll."owner_id" = ${link.ownerId}::uuid
            ORDER BY ll."position" ASC
            FOR UPDATE OF p
          `;
          const lineCount = await tx.paymentLinkV2Line.count({ where: { paymentLinkV2Id: link.id, ownerId: link.ownerId } });
          if (lines.length === 0 || lines.length !== lineCount) return null;
          amount = totalFromLines(lines);
        } else {
          if (!link.amount || !link.descriptionPtBr || !link.descriptionEn) return null;
          amount = link.amount;
        }

        const order = await tx.orderV2.create({
          data: {
            id: identity.id,
            ownerId: link.ownerId,
            source: "LINK",
            paymentLinkV2Id: link.id,
            state: "CREATED",
            lifecycleVersion: 0,
            amount,
            currencyUuid: link.currencyUuid,
            exchangeCurrencyUuid: link.exchangeCurrencyUuid,
            descriptionPtBr: link.descriptionPtBr,
            descriptionEn: link.descriptionEn,
            checkoutDataPolicy: policy,
            ...customerColumns(snapshot),
            settledAt: null,
            createdAt: identity.createdAt,
            updatedAt: identity.updatedAt,
            lines: {
              create: lines.map((line) => ({
                ownerId: link.ownerId,
                productId: line.productId,
                position: line.position,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              })),
            },
          },
          select: orderSelect,
        });
        return toStoredOrderV2(order as PrismaOrderV2);
      });
    },
    async settle(input, nextState, settledAt) {
      return prisma.$transaction(async (tx) => {
        // Link-less STANDALONE orders take the same versioned CAS with no link
        // join and no single-use claim; the link row (when present) is locked
        // separately because FOR UPDATE cannot name the nullable side of an
        // outer join.
        const rows = await tx.$queryRaw<LockedSettlement[]>`
          SELECT o."id" AS "orderId", o."owner_id" AS "ownerId", o."payment_link_v2_id" AS "paymentLinkV2Id",
                 o."state", o."lifecycle_version" AS "lifecycleVersion"
          FROM "app"."provider_order" po
          JOIN "app"."order_v2" o ON o."id" = po."order_v2_id" AND o."owner_id" = po."owner_id"
          WHERE po."id" = ${input.providerOrderId}::uuid AND po."owner_id" = ${input.ownerId}::uuid
            AND po."order_v2_id" = ${input.orderV2Id}::uuid
            AND po."provider_order_uuid" = ${input.providerOrderUuid}::uuid
            AND po."reconciliation_version" = ${input.observedProviderReconciliationVersion}
            AND po."status" = ${input.authoritativeProviderStatus}
            AND o."lifecycle_version" = ${input.observedLocalLifecycleVersion}
          FOR UPDATE OF po, o
        `;
        const locked = rows[0];
        if (!locked || locked.state === nextState || !isEligibleTransition(locked.state, nextState)) return { kind: "no-op" };
        let linkType: "SINGLE_USE" | "REUSABLE" | null = null;
        if (locked.paymentLinkV2Id) {
          const links = await tx.$queryRaw<Array<{ linkType: "SINGLE_USE" | "REUSABLE" }>>`
            SELECT l."link_type" AS "linkType"
            FROM "app"."payment_link_v2" l
            WHERE l."id" = ${locked.paymentLinkV2Id}::uuid AND l."owner_id" = ${locked.ownerId}::uuid
            FOR UPDATE
          `;
          linkType = links[0]?.linkType ?? null;
        }
        if (nextState === "CONFIRMED" && locked.paymentLinkV2Id && linkType === "SINGLE_USE") {
          try {
            await tx.paymentLinkV2SingleUseSettlement.create({ data: { paymentLinkV2Id: locked.paymentLinkV2Id, ownerId: locked.ownerId, orderV2Id: locked.orderId, claimedAt: settledAt } });
          } catch (error) {
            if (isUniqueConflict(error)) return { kind: "no-op" };
            throw error;
          }
        }
        const stampedAt = nextState === "CONFIRMED" ? settledAt : null;
        const changed = await tx.$executeRaw`
          UPDATE "app"."order_v2" o
          SET "state" = ${nextState}, "lifecycle_version" = o."lifecycle_version" + 1,
              "settled_at" = COALESCE(${stampedAt}, o."settled_at"), "updated_at" = CURRENT_TIMESTAMP
          WHERE o."id" = ${locked.orderId}::uuid AND o."owner_id" = ${input.ownerId}::uuid
            AND o."lifecycle_version" = ${input.observedLocalLifecycleVersion} AND o."state" = ${locked.state}
            AND EXISTS (
              SELECT 1 FROM "app"."provider_order" po
              WHERE po."id" = ${input.providerOrderId}::uuid AND po."owner_id" = ${input.ownerId}::uuid
                AND po."order_v2_id" = ${input.orderV2Id}::uuid AND po."provider_order_uuid" = ${input.providerOrderUuid}::uuid
                AND po."reconciliation_version" = ${input.observedProviderReconciliationVersion} AND po."status" = ${input.authoritativeProviderStatus}
            )
        `;
        if (changed !== 1) throw new Error("Order V2 settlement fence changed");
        return { kind: "settled", state: nextState };
      });
    },
  };
}

export function getOrderV2Service() {
  return createOrderV2Service(createOrderV2Store(getDatabaseClient()));
}

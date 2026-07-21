import "server-only";

import { getDatabaseClient } from "../db/client";
import type { PrismaClient } from "../generated/prisma/client";

export const CHECKOUT_DATA_POLICIES = ["NONE", "NAME_EMAIL", "EMAIL", "NAME_EMAIL_CPF", "NAME_EMAIL_CPF_ADDRESS"] as const;
export const PAYMENT_LINK_ORDER_STATES = ["CREATED", "PENDING", "CONFIRMED", "REJECTED", "CANCELLED", "EXPIRED", "INDETERMINATE", "REFUNDED"] as const;

export type CheckoutDataPolicy = (typeof CHECKOUT_DATA_POLICIES)[number];
export type PaymentLinkOrderState = (typeof PAYMENT_LINK_ORDER_STATES)[number];
export type CustomerAddressV1 = Readonly<{
  street: string;
  number: string;
  district: string;
  city: string;
  stateUf: string;
  postalCode: string;
  country: "BR";
  complement: string | null;
}>;
export type CustomerSnapshotV1 = Readonly<{
  name: string | null;
  email: string | null;
  cpf: string | null;
  address: CustomerAddressV1 | null;
}>;
export type SettlementInputV1 = Readonly<{
  ownerId: string;
  paymentLinkOrderId: string;
  providerOrderId: string;
  providerOrderUuid: string;
  observedProviderReconciliationVersion: number;
  observedLocalLifecycleVersion: number;
  authoritativeProviderStatus: string;
}>;
export type CreatePaymentLinkOrderResult = Readonly<{ kind: "created"; orderId: string }> | Readonly<{ kind: "unavailable" }>;
export type SettlementResult = Readonly<{ kind: "settled"; state: PaymentLinkOrderState }> | Readonly<{ kind: "no-op" }>;

export type ValidatedSettlementInput = Omit<SettlementInputV1, "authoritativeProviderStatus"> & {
  readonly authoritativeProviderStatus: AuthoritativeProviderStatus;
};
type AuthoritativeProviderStatus = "new" | "processing" | "paid" | "finished" | "rejected" | "canceled" | "expired" | "refunded";
export type StoredLinkOrder = Readonly<{
  id: string;
  ownerId: string;
  paymentLinkId: string;
  productId: string;
  productPrice: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  checkoutDataPolicy: CheckoutDataPolicy;
  state: PaymentLinkOrderState;
  lifecycleVersion: number;
}>;

export type PaymentLinkOrderStore = Readonly<{
  createFromAvailableLink(paymentLinkId: string, snapshot: CustomerSnapshotV1): Promise<StoredLinkOrder | null>;
  settle(input: ValidatedSettlementInput, nextState: PaymentLinkOrderState): Promise<SettlementResult>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNICODE_WHITESPACE = " \\t\\n\\r\\f\\v\\u00a0\\u1680\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff";
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/u;
const BRAZILIAN_UFS = new Set(["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]);
const AUTHORITATIVE_STATUSES = new Set<AuthoritativeProviderStatus>(["new", "processing", "paid", "finished", "rejected", "canceled", "expired", "refunded"]);

function opaqueUnavailable(): CreatePaymentLinkOrderResult {
  return { kind: "unavailable" };
}

function codePointLength(value: string): number {
  return [...value].length;
}

function normalizedText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(new RegExp(`^[${UNICODE_WHITESPACE}]+|[${UNICODE_WHITESPACE}]+$`, "gu"), "");
  return codePointLength(normalized) >= min && codePointLength(normalized) <= max && !CONTROL_PATTERN.test(normalized) ? normalized : null;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function validateEmail(value: unknown): string | null {
  const email = normalizedText(value, 3, 254);
  return email && !/[\s]/u.test(email) && EMAIL_PATTERN.test(email) ? email : null;
}

function validateCpf(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value)) return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return null;
  const digitAt = (length: number) => {
    const sum = [...digits.slice(0, length)].reduce((total, digit, index) => total + (digit.charCodeAt(0) - 48) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digitAt(9) === digits.charCodeAt(9) - 48 && digitAt(10) === digits.charCodeAt(10) - 48 ? digits : null;
}

function validateAddress(value: unknown): CustomerAddressV1 | null {
  const address = object(value);
  if (!address || !exactKeys(address, ["street", "number", "district", "city", "stateUf", "postalCode", "country", "complement"])) return null;
  const street = normalizedText(address.street, 1, 160);
  const number = normalizedText(address.number, 1, 32);
  const district = normalizedText(address.district, 1, 120);
  const city = normalizedText(address.city, 1, 120);
  const state = normalizedText(address.stateUf, 2, 2);
  const stateUf = state?.toUpperCase() ?? "";
  const postalCode = typeof address.postalCode === "string" && /^(?:\d{8}|\d{5}-\d{3})$/.test(address.postalCode) ? address.postalCode.replace("-", "") : "";
  const complement = address.complement === undefined || address.complement === null
    ? null
    : normalizedText(address.complement, 1, 160);
  if (!street || !number || !district || !city || !BRAZILIAN_UFS.has(stateUf) || !/^\d{8}$/.test(postalCode) || address.country !== "BR" || (address.complement !== undefined && address.complement !== null && typeof address.complement !== "string")) return null;
  return { street, number, district, city, stateUf, postalCode, country: "BR", complement };
}

export function normalizeCustomerSnapshotV1(policy: CheckoutDataPolicy, value: unknown): CustomerSnapshotV1 | null {
  const snapshot = object(value);
  if (!snapshot || !exactKeys(snapshot, ["name", "email", "cpf", "address"])) return null;
  const name = snapshot.name == null ? null : normalizedText(snapshot.name, 1, 160);
  const email = snapshot.email == null ? null : validateEmail(snapshot.email);
  const cpf = snapshot.cpf == null ? null : validateCpf(snapshot.cpf);
  const address = snapshot.address == null ? null : validateAddress(snapshot.address);
  if ((snapshot.name != null && !name) || (snapshot.email != null && !email) || (snapshot.cpf != null && !cpf) || (snapshot.address != null && !address)) return null;
  const normalized = { name, email, cpf, address } satisfies CustomerSnapshotV1;
  const exactTuple = (policy === "NONE" && !name && !email && !cpf && !address)
    || (policy === "NAME_EMAIL" && !!name && !!email && !cpf && !address)
    || (policy === "EMAIL" && !name && !!email && !cpf && !address)
    || (policy === "NAME_EMAIL_CPF" && !!name && !!email && !!cpf && !address)
    || (policy === "NAME_EMAIL_CPF_ADDRESS" && !!name && !!email && !!cpf && !!address);
  return exactTuple ? normalized : null;
}

function mapSettlementStatus(status: AuthoritativeProviderStatus): PaymentLinkOrderState {
  if (status === "new") return "PENDING";
  if (status === "processing" || status === "paid" || status === "finished") return "CONFIRMED";
  if (status === "rejected") return "REJECTED";
  if (status === "canceled") return "CANCELLED";
  if (status === "expired") return "EXPIRED";
  return "REFUNDED";
}

function validSettlementInput(value: SettlementInputV1): ValidatedSettlementInput | null {
  if (!UUID_PATTERN.test(value.ownerId) || !UUID_PATTERN.test(value.paymentLinkOrderId) || !UUID_PATTERN.test(value.providerOrderId) || !UUID_PATTERN.test(value.providerOrderUuid)) return null;
  if (!Number.isSafeInteger(value.observedProviderReconciliationVersion) || value.observedProviderReconciliationVersion < 0 || !Number.isSafeInteger(value.observedLocalLifecycleVersion) || value.observedLocalLifecycleVersion < 0 || !AUTHORITATIVE_STATUSES.has(value.authoritativeProviderStatus as AuthoritativeProviderStatus)) return null;
  return { ...value, ownerId: value.ownerId.toLowerCase(), paymentLinkOrderId: value.paymentLinkOrderId.toLowerCase(), providerOrderId: value.providerOrderId.toLowerCase(), providerOrderUuid: value.providerOrderUuid.toLowerCase(), authoritativeProviderStatus: value.authoritativeProviderStatus as AuthoritativeProviderStatus };
}

export function createPaymentLinkOrderService(store: PaymentLinkOrderStore) {
  return {
    async create(paymentLinkId: unknown, snapshot: unknown): Promise<CreatePaymentLinkOrderResult> {
      if (typeof paymentLinkId !== "string" || !UUID_PATTERN.test(paymentLinkId)) return opaqueUnavailable();
      const order = await store.createFromAvailableLink(paymentLinkId.toLowerCase(), snapshot as CustomerSnapshotV1);
      return order ? { kind: "created", orderId: order.id } : opaqueUnavailable();
    },
    async settle(input: SettlementInputV1): Promise<SettlementResult> {
      const validated = validSettlementInput(input);
      return validated ? store.settle(validated, mapSettlementStatus(validated.authoritativeProviderStatus)) : { kind: "no-op" };
    },
  };
}

type LockedPaymentLink = Readonly<{
  id: string;
  ownerId: string;
  productId: string;
  productPrice: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  checkoutDataPolicy: CheckoutDataPolicy;
}>;
type LockedSettlement = Readonly<{
  orderId: string;
  ownerId: string;
  paymentLinkId: string;
  linkType: "SINGLE_USE" | "REUSABLE";
  state: PaymentLinkOrderState;
  lifecycleVersion: number;
}>;

function isEligibleTransition(current: PaymentLinkOrderState, next: PaymentLinkOrderState): boolean {
  if (current === next) return false;
  if (next === "REFUNDED") return current === "CONFIRMED";
  return current === "PENDING" || current === "INDETERMINATE";
}

function isUniqueConflict(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "P2002";
}

export function createPrismaPaymentLinkOrderStore(prisma: PrismaClient): PaymentLinkOrderStore {
  return {
    async createFromAvailableLink(paymentLinkId, suppliedSnapshot) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockedPaymentLink[]>`
          SELECT l."id", l."owner_id" AS "ownerId", l."product_id" AS "productId", p."price" AS "productPrice",
                 c."currency_uuid" AS "currencyUuid", c."exchange_currency_uuid" AS "exchangeCurrencyUuid",
                 u."checkout_data_policy" AS "checkoutDataPolicy"
          FROM "app"."payment_link" l
          JOIN "app"."product" p ON p."id" = l."product_id" AND p."owner_id" = l."owner_id"
          JOIN "app"."catalog_currency_pair" c ON c."id" = l."currency_pair_id"
          JOIN "app"."user" u ON u."id" = l."owner_id"
          WHERE l."id" = ${paymentLinkId}::uuid AND l."active" = true AND p."active" = true
            AND (l."expires_at" IS NULL OR l."expires_at" > CURRENT_TIMESTAMP)
          FOR UPDATE OF l, p, u
        `;
        const link = rows[0];
        if (!link) return null;
        const snapshot = normalizeCustomerSnapshotV1(link.checkoutDataPolicy, suppliedSnapshot);
        if (!snapshot) return null;
        return tx.paymentLinkOrder.create({
          data: {
            ownerId: link.ownerId,
            paymentLinkId: link.id,
            productId: link.productId,
            productPrice: link.productPrice,
            currencyUuid: link.currencyUuid,
            exchangeCurrencyUuid: link.exchangeCurrencyUuid,
            checkoutDataPolicy: link.checkoutDataPolicy,
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
          },
          select: { id: true, ownerId: true, paymentLinkId: true, productId: true, productPrice: true, currencyUuid: true, exchangeCurrencyUuid: true, checkoutDataPolicy: true, state: true, lifecycleVersion: true },
        }) as Promise<StoredLinkOrder>;
      });
    },
    async settle(input, nextState) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockedSettlement[]>`
          SELECT o."id" AS "orderId", o."owner_id" AS "ownerId", o."payment_link_id" AS "paymentLinkId",
                 l."link_type" AS "linkType", o."state", o."lifecycle_version" AS "lifecycleVersion"
          FROM "app"."provider_order" po
          JOIN "app"."payment_link_order" o ON o."id" = po."payment_link_order_id" AND o."owner_id" = po."owner_id"
          JOIN "app"."payment_link" l ON l."id" = o."payment_link_id" AND l."owner_id" = o."owner_id" AND l."product_id" = o."product_id"
          WHERE po."id" = ${input.providerOrderId}::uuid AND po."owner_id" = ${input.ownerId}::uuid
            AND po."payment_link_order_id" = ${input.paymentLinkOrderId}::uuid
            AND po."provider_order_uuid" = ${input.providerOrderUuid}::uuid
            AND po."reconciliation_version" = ${input.observedProviderReconciliationVersion}
            AND po."status" = ${input.authoritativeProviderStatus}
            AND o."lifecycle_version" = ${input.observedLocalLifecycleVersion}
          FOR UPDATE OF po, o, l
        `;
        const locked = rows[0];
        if (!locked || locked.state === nextState || !isEligibleTransition(locked.state, nextState)) return { kind: "no-op" };
        if (nextState === "CONFIRMED" && locked.linkType === "SINGLE_USE") {
          try {
            await tx.paymentLinkSingleUseSettlement.create({ data: { paymentLinkId: locked.paymentLinkId, ownerId: locked.ownerId, paymentLinkOrderId: locked.orderId } });
          } catch (error) {
            if (isUniqueConflict(error)) return { kind: "no-op" };
            throw error;
          }
        }
        const settledAt = nextState === "CONFIRMED" ? new Date() : null;
        const changed = await tx.$executeRaw`
          UPDATE "app"."payment_link_order" o
          SET "state" = ${nextState}, "lifecycle_version" = o."lifecycle_version" + 1,
              "settled_at" = COALESCE(${settledAt}, o."settled_at"), "updated_at" = CURRENT_TIMESTAMP
          WHERE o."id" = ${locked.orderId}::uuid AND o."owner_id" = ${input.ownerId}::uuid
            AND o."lifecycle_version" = ${input.observedLocalLifecycleVersion} AND o."state" = ${locked.state}
            AND EXISTS (
              SELECT 1 FROM "app"."provider_order" po
              WHERE po."id" = ${input.providerOrderId}::uuid AND po."owner_id" = ${input.ownerId}::uuid
                AND po."payment_link_order_id" = ${input.paymentLinkOrderId}::uuid AND po."provider_order_uuid" = ${input.providerOrderUuid}::uuid
                AND po."reconciliation_version" = ${input.observedProviderReconciliationVersion} AND po."status" = ${input.authoritativeProviderStatus}
            )
        `;
        if (changed !== 1) throw new Error("Payment-link order settlement fence changed");
        return { kind: "settled", state: nextState };
      });
    },
  };
}

export function getPaymentLinkOrderService() {
  return createPaymentLinkOrderService(createPrismaPaymentLinkOrderStore(getDatabaseClient()));
}

import "server-only";

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { getNauttCredentialService } from "@/auth/nautt-credential";
import { getDatabaseClient } from "@/db/client";
import { loadEncryptionKey } from "@/lib/nautt-crypto";
import { normalizeCustomerSnapshotV1, type CheckoutDataPolicy, type CustomerSnapshotV1 } from "@/orders/payment-link-order";
import { createStandaloneOrderRow, isCanonicalOrderAmount } from "@/orders/order-v2";
import { createOwnerPricingOrdersService } from "@/integrations/nautt/owner-pricing-orders";
import { getPricingOrdersAdapter, NauttOrderCreationIndeterminateError } from "@/integrations/nautt/pricing-orders-client";
import { createPrismaProviderOrderStore } from "@/integrations/nautt/provider-order-store";

// Sessionless standalone checkout (9.2.1): mirrors the V1 public checkout
// fencing with the store slug as the only browser-supplied identity. The
// browser supplies only the slug (path), an opaque retry key, the amount
// string, and the customer snapshot; owner, policy, currency pair,
// description, and expiry are derived from locked persisted state inside the
// reservation transaction (owner row FOR UPDATE, registry pair FOR SHARE).
const SLUG_PATTERN = /^[a-z0-9](-?[a-z0-9])*$/;
const SLUG_MAXIMUM_LENGTH = 63;
const RETRY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CAPABILITY_KEY_VERSION = "v1";
const REQUEST_CONTRACT_VERSION = "v1";
const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;

type CheckoutAttemptState = "RESERVED" | "CREATING" | "PENDING" | "INDETERMINATE";
type PaymentView = Readonly<{ state: CheckoutAttemptState; pixCopyPaste?: string; pixQrCodeUrl?: string }>;
export type StandaloneCheckoutResult =
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "provider-unavailable" }>
  | Readonly<{ kind: "accepted"; status: 201 | 202; payment: PaymentView; statusCapability: string }>;

type AttemptRecord = Readonly<{
  id: string;
  ownerId: string;
  orderV2Id: string;
  requestVerifier: string;
  capabilityNonce: string;
  capabilityKeyVersion: string;
  capabilityVerifier: string;
  capabilityExpiresAt: Date;
  capabilityRevokedAt: Date | null;
  state: CheckoutAttemptState;
  owner: Readonly<{ storefrontEnabled: boolean; storefrontStandalonePaymentsEnabled: boolean }>;
  order: Readonly<{ providerOrders: ReadonlyArray<Readonly<{ status: string | null; pixCopyPaste: string | null; pixQrcodeUrl: string | null }>> }>;
}>;

type LockedOwner = Readonly<{
  ownerId: string;
  checkoutDataPolicy: CheckoutDataPolicy;
  defaultCurrencyCode: string | null;
}>;

type LockedPair = Readonly<{
  currencyUuid: string;
  exchangeCurrencyUuid: string;
}>;

type Reservation = Readonly<{ kind: "created"; attempt: AttemptRecord; ownerId: string; amount: string; currencyUuid: string; exchangeCurrencyUuid: string }>
  | Readonly<{ kind: "replay"; attempt: AttemptRecord }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>;

type CheckoutStore = Readonly<{
  reserve(input: { slug: string; retryKey: string; amount: string; customer: unknown; now: Date }): Promise<Reservation>;
  markCreating(attempt: AttemptRecord["id"]): Promise<boolean>;
  markPending(attempt: AttemptRecord["id"]): Promise<AttemptRecord | null>;
  markIndeterminate(attempt: AttemptRecord["id"]): Promise<AttemptRecord | null>;
}>;

type Dependencies = Readonly<{
  now: () => Date;
  capabilityKey: () => Buffer;
  provider: ReturnType<typeof createOwnerPricingOrdersService>;
}>;

function digest(key: Buffer, value: string): string { return createHmac("sha256", key).update(value).digest("hex"); }
function canonicalCustomer(customer: CustomerSnapshotV1): string { return JSON.stringify(customer); }
function capability(key: Buffer, attempt: Pick<AttemptRecord, "id" | "capabilityNonce" | "capabilityExpiresAt" | "capabilityKeyVersion">): string {
  return createHmac("sha256", key).update(`standalone-checkout-capability:${attempt.capabilityKeyVersion}:${attempt.id}:${attempt.capabilityExpiresAt.toISOString()}:${attempt.capabilityNonce}`).digest("base64url");
}
function validCapability(key: Buffer, attempt: AttemptRecord, now: Date): string | null {
  // The storefront+standalone toggle gate is the analog of the V1 link-active
  // gate: a replay reissues the capability only while the store still sells.
  if (attempt.capabilityKeyVersion !== CAPABILITY_KEY_VERSION || attempt.capabilityRevokedAt || attempt.capabilityExpiresAt <= now || !attempt.owner.storefrontEnabled || !attempt.owner.storefrontStandalonePaymentsEnabled) return null;
  const bearer = capability(key, attempt);
  const verifier = createHash("sha256").update(bearer).digest("hex");
  return timingSafeEqual(Buffer.from(verifier), Buffer.from(attempt.capabilityVerifier)) ? bearer : null;
}
function paymentView(attempt: AttemptRecord): PaymentView {
  const order = attempt.order.providerOrders[0];
  if (attempt.state === "PENDING" && order?.status) return { state: "PENDING", ...(order.pixCopyPaste ? { pixCopyPaste: order.pixCopyPaste } : {}), ...(order.pixQrcodeUrl ? { pixQrCodeUrl: order.pixQrcodeUrl } : {}) };
  return { state: attempt.state };
}
function accepted(attempt: AttemptRecord, key: Buffer, now: Date): StandaloneCheckoutResult {
  const statusCapability = validCapability(key, attempt, now);
  if (!statusCapability) return { kind: "unavailable" };
  return { kind: "accepted", status: attempt.state === "PENDING" ? 201 : 202, payment: paymentView(attempt), statusCapability };
}

export function createStandaloneCheckoutService(store: CheckoutStore, dependencies: Dependencies) {
  return {
    async checkout(slug: unknown, input: unknown): Promise<StandaloneCheckoutResult> {
      if (typeof slug !== "string" || slug.length > SLUG_MAXIMUM_LENGTH || !SLUG_PATTERN.test(slug) || !input || typeof input !== "object" || Array.isArray(input)) return { kind: "invalid" };
      const body = input as Record<string, unknown>;
      if (Object.keys(body).length !== 3 || !("idempotencyKey" in body) || !("amount" in body) || !("customer" in body) || typeof body.idempotencyKey !== "string" || !RETRY_KEY_PATTERN.test(body.idempotencyKey) || !isCanonicalOrderAmount(body.amount)) return { kind: "invalid" };
      const now = dependencies.now();
      let reservation: Reservation;
      try {
        reservation = await store.reserve({ slug, retryKey: body.idempotencyKey, amount: body.amount, customer: body.customer, now });
      } catch {
        return { kind: "unavailable" };
      }
      if (reservation.kind === "invalid" || reservation.kind === "unavailable") return reservation;
      if (reservation.kind === "replay") return accepted(reservation.attempt, dependencies.capabilityKey(), now);
      try {
        if (!await store.markCreating(reservation.attempt.id)) return { kind: "provider-unavailable" };
        const quote = await dependencies.provider.quote(reservation.ownerId, { currencyUuid: reservation.currencyUuid, exchangeCurrencyUuid: reservation.exchangeCurrencyUuid, amount: { kind: "fiat", value: reservation.amount } });
        await dependencies.provider.createOrder(reservation.ownerId, { quoteUuid: quote.quoteUuid }, {}, undefined, reservation.attempt.orderV2Id);
        const completed = await store.markPending(reservation.attempt.id);
        return completed ? accepted(completed, dependencies.capabilityKey(), dependencies.now()) : { kind: "unavailable" };
      } catch (error) {
        if (error instanceof NauttOrderCreationIndeterminateError) {
          const indeterminate = await store.markIndeterminate(reservation.attempt.id).catch(() => null);
          return indeterminate ? accepted(indeterminate, dependencies.capabilityKey(), dependencies.now()) : { kind: "provider-unavailable" };
        }
        await store.markIndeterminate(reservation.attempt.id).catch(() => undefined);
        return { kind: "provider-unavailable" };
      }
    },
  };
}

export function createPrismaStandaloneCheckoutStore(db = getDatabaseClient(), key = loadEncryptionKey()): CheckoutStore {
  const record = { include: { owner: { select: { storefrontEnabled: true, storefrontStandalonePaymentsEnabled: true } }, order: { select: { providerOrders: { select: { status: true, pixCopyPaste: true, pixQrcodeUrl: true } } } } } } as const;
  const toAttempt = (value: unknown) => value as AttemptRecord;
  return {
    async reserve({ slug, retryKey, amount, customer, now }) {
      return db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<LockedOwner[]>`
          SELECT u."id" AS "ownerId", u."checkout_data_policy" AS "checkoutDataPolicy", u."storefront_default_currency_code" AS "defaultCurrencyCode"
          FROM "app"."user" u
          WHERE u."storefront_slug" = ${slug} AND u."storefront_enabled" = true AND u."storefront_standalone_payments_enabled" = true
          FOR UPDATE OF u
        `;
        const owner = locked[0];
        if (!owner?.defaultCurrencyCode) return { kind: "unavailable" } as const;
        const pairs = await tx.$queryRaw<LockedPair[]>`
          SELECT c."currency_uuid" AS "currencyUuid", c."exchange_currency_uuid" AS "exchangeCurrencyUuid"
          FROM "app"."supported_exchange_currency" s
          JOIN "app"."catalog_currency_pair" c ON c."id" = s."pair_id"
          WHERE s."code" = ${owner.defaultCurrencyCode} AND c."active" = true
          FOR SHARE OF c
        `;
        const pair = pairs[0];
        if (!pair) return { kind: "unavailable" } as const;
        const snapshot = normalizeCustomerSnapshotV1(owner.checkoutDataPolicy, customer);
        if (!snapshot) return { kind: "invalid" } as const;
        const retryKeyVerifier = digest(key, `standalone-checkout-retry:${retryKey}`);
        const requestVerifier = digest(key, `standalone-checkout-request:${REQUEST_CONTRACT_VERSION}:${owner.ownerId}:${retryKeyVerifier}:${owner.checkoutDataPolicy}:${amount}:${canonicalCustomer(snapshot)}`);
        const existing = await tx.standaloneCheckoutAttempt.findUnique({ where: { ownerId_retryKeyVerifier: { ownerId: owner.ownerId, retryKeyVerifier } }, ...record });
        if (existing) return existing.requestVerifier === requestVerifier ? { kind: "replay", attempt: toAttempt(existing) } as const : { kind: "unavailable" } as const;
        const id = randomUUID();
        const nonce = randomBytes(32).toString("base64url");
        const capabilityExpiresAt = new Date(now.getTime() + CAPABILITY_TTL_MS);
        const bearer = capability(key, { id, capabilityNonce: nonce, capabilityExpiresAt, capabilityKeyVersion: CAPABILITY_KEY_VERSION });
        const orderV2Id = randomUUID();
        await createStandaloneOrderRow(tx, { id: orderV2Id, ownerId: owner.ownerId, amount, currencyUuid: pair.currencyUuid, exchangeCurrencyUuid: pair.exchangeCurrencyUuid, checkoutDataPolicy: owner.checkoutDataPolicy, customer: snapshot, createdAt: now, updatedAt: now });
        const attempt = await tx.standaloneCheckoutAttempt.create({ data: { id, ownerId: owner.ownerId, orderV2Id, retryKeyVerifier, requestVerifier, capabilityNonce: nonce, capabilityKeyVersion: CAPABILITY_KEY_VERSION, capabilityVerifier: createHash("sha256").update(bearer).digest("hex"), capabilityExpiresAt, state: "RESERVED", createdAt: now, updatedAt: now }, ...record });
        return { kind: "created", attempt: toAttempt(attempt), ownerId: owner.ownerId, amount, currencyUuid: pair.currencyUuid, exchangeCurrencyUuid: pair.exchangeCurrencyUuid } as const;
      });
    },
    async markCreating(id) {
      const result = await db.standaloneCheckoutAttempt.updateMany({ where: { id, state: "RESERVED" }, data: { state: "CREATING" } });
      return result.count === 1;
    },
    async markPending(id) {
      await db.$transaction(async (tx) => {
        const updated = await tx.standaloneCheckoutAttempt.updateMany({ where: { id, state: "CREATING" }, data: { state: "PENDING" } });
        if (updated.count === 1) await tx.orderV2.updateMany({ where: { standaloneCheckoutAttempt: { is: { id } }, state: "CREATED" }, data: { state: "PENDING" } });
      });
      const attempt = await db.standaloneCheckoutAttempt.findUnique({ where: { id }, ...record });
      return attempt ? toAttempt(attempt) : null;
    },
    async markIndeterminate(id) {
      await db.$transaction(async (tx) => {
        const updated = await tx.standaloneCheckoutAttempt.updateMany({ where: { id, state: { in: ["RESERVED", "CREATING"] } }, data: { state: "INDETERMINATE" } });
        if (updated.count === 1) await tx.orderV2.updateMany({ where: { standaloneCheckoutAttempt: { is: { id } }, state: "CREATED" }, data: { state: "INDETERMINATE" } });
      });
      const attempt = await db.standaloneCheckoutAttempt.findUnique({ where: { id }, ...record });
      return attempt ? toAttempt(attempt) : null;
    },
  };
}

let shared: ReturnType<typeof createStandaloneCheckoutService> | undefined;
export function getStandaloneCheckoutService() {
  shared ??= createStandaloneCheckoutService(createPrismaStandaloneCheckoutStore(), { now: () => new Date(), capabilityKey: loadEncryptionKey, provider: createOwnerPricingOrdersService(getNauttCredentialService(), getPricingOrdersAdapter(), createPrismaProviderOrderStore(getDatabaseClient())) });
  return shared;
}

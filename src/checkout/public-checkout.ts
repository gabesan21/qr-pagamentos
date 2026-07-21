import "server-only";

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { getNauttCredentialService } from "@/auth/nautt-credential";
import { getDatabaseClient } from "@/db/client";
import { loadEncryptionKey } from "@/lib/nautt-crypto";
import { normalizeCustomerSnapshotV1, type CheckoutDataPolicy, type CustomerSnapshotV1 } from "@/orders/payment-link-order";
import { createOwnerPricingOrdersService } from "@/integrations/nautt/owner-pricing-orders";
import { getPricingOrdersAdapter, NauttOrderCreationIndeterminateError } from "@/integrations/nautt/pricing-orders-client";
import { createPrismaProviderOrderStore } from "@/integrations/nautt/provider-order-store";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;
const RETRY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CAPABILITY_KEY_VERSION = "v1";
const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;

type CheckoutAttemptState = "RESERVED" | "CREATING" | "PENDING" | "INDETERMINATE";
type PaymentView = Readonly<{ state: CheckoutAttemptState; pixCopyPaste?: string; pixQrCodeUrl?: string }>;
export type PublicCheckoutResult =
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "provider-unavailable" }>
  | Readonly<{ kind: "accepted"; status: 201 | 202; payment: PaymentView; statusCapability: string }>;

type AttemptRecord = Readonly<{
  id: string;
  ownerId: string;
  paymentLinkId: string;
  paymentLinkOrderId: string;
  requestVerifier: string;
  capabilityNonce: string;
  capabilityKeyVersion: string;
  capabilityVerifier: string;
  capabilityExpiresAt: Date;
  capabilityRevokedAt: Date | null;
  state: CheckoutAttemptState;
  paymentLink: Readonly<{ active: boolean; expiresAt: Date | null }>;
  paymentLinkOrder: Readonly<{ providerOrder: Readonly<{ status: string | null; pixCopyPaste: string | null; pixQrcodeUrl: string | null }> | null }>;
}>;

type LockedLink = Readonly<{
  id: string; ownerId: string; productId: string; productPrice: string; currencyUuid: string; exchangeCurrencyUuid: string;
  checkoutDataPolicy: CheckoutDataPolicy; expiresAt: Date | null; linkType: "SINGLE_USE" | "REUSABLE";
}>;

type Reservation = Readonly<{ kind: "created"; attempt: AttemptRecord; ownerId: string; amount: string; currencyUuid: string; exchangeCurrencyUuid: string }>
  | Readonly<{ kind: "replay"; attempt: AttemptRecord }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>;

type CheckoutStore = Readonly<{
  reserve(input: { identifier: string; retryKey: string; customer: unknown; now: Date }): Promise<Reservation>;
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
  return createHmac("sha256", key).update(`checkout-capability:${attempt.capabilityKeyVersion}:${attempt.id}:${attempt.capabilityExpiresAt.toISOString()}:${attempt.capabilityNonce}`).digest("base64url");
}
function validCapability(key: Buffer, attempt: AttemptRecord, now: Date): string | null {
  if (attempt.capabilityKeyVersion !== CAPABILITY_KEY_VERSION || attempt.capabilityRevokedAt || attempt.capabilityExpiresAt <= now || !attempt.paymentLink.active || (attempt.paymentLink.expiresAt && attempt.paymentLink.expiresAt <= now)) return null;
  const bearer = capability(key, attempt);
  const verifier = createHash("sha256").update(bearer).digest("hex");
  return timingSafeEqual(Buffer.from(verifier), Buffer.from(attempt.capabilityVerifier)) ? bearer : null;
}
function paymentView(attempt: AttemptRecord): PaymentView {
  const order = attempt.paymentLinkOrder.providerOrder;
  if (attempt.state === "PENDING" && order?.status) return { state: "PENDING", ...(order.pixCopyPaste ? { pixCopyPaste: order.pixCopyPaste } : {}), ...(order.pixQrcodeUrl ? { pixQrCodeUrl: order.pixQrcodeUrl } : {}) };
  return { state: attempt.state };
}
function accepted(attempt: AttemptRecord, key: Buffer, now: Date): PublicCheckoutResult {
  const statusCapability = validCapability(key, attempt, now);
  if (!statusCapability) return { kind: "unavailable" };
  return { kind: "accepted", status: attempt.state === "PENDING" ? 201 : 202, payment: paymentView(attempt), statusCapability };
}

export function createPublicCheckoutService(store: CheckoutStore, dependencies: Dependencies) {
  return {
    async checkout(identifier: unknown, input: unknown): Promise<PublicCheckoutResult> {
      if (!IDENTIFIER_PATTERN.test(typeof identifier === "string" ? identifier : "") || !input || typeof input !== "object" || Array.isArray(input)) return { kind: "invalid" };
      const body = input as Record<string, unknown>;
      if (Object.keys(body).length !== 2 || !("idempotencyKey" in body) || !("customer" in body) || typeof body.idempotencyKey !== "string" || !RETRY_KEY_PATTERN.test(body.idempotencyKey)) return { kind: "invalid" };
      const now = dependencies.now();
      let reservation: Reservation;
      try {
        reservation = await store.reserve({ identifier: identifier as string, retryKey: body.idempotencyKey, customer: body.customer, now });
      } catch {
        return { kind: "unavailable" };
      }
      if (reservation.kind === "invalid" || reservation.kind === "unavailable") return reservation;
      if (reservation.kind === "replay") return accepted(reservation.attempt, dependencies.capabilityKey(), now);
      try {
        if (!await store.markCreating(reservation.attempt.id)) return { kind: "provider-unavailable" };
        const quote = await dependencies.provider.quote(reservation.ownerId, { currencyUuid: reservation.currencyUuid, exchangeCurrencyUuid: reservation.exchangeCurrencyUuid, amount: { kind: "fiat", value: reservation.amount } });
        await dependencies.provider.createOrder(reservation.ownerId, { quoteUuid: quote.quoteUuid }, {}, reservation.attempt.paymentLinkOrderId);
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

export function createPrismaCheckoutStore(db = getDatabaseClient(), key = loadEncryptionKey()): CheckoutStore {
  const record = { include: { paymentLink: { select: { active: true, expiresAt: true } }, paymentLinkOrder: { include: { providerOrder: { select: { status: true, pixCopyPaste: true, pixQrcodeUrl: true } } } } } } as const;
  const toAttempt = (value: unknown) => value as AttemptRecord;
  return {
    async reserve({ identifier, retryKey, customer, now }) {
      return db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<LockedLink[]>`
          SELECT l."id", l."owner_id" AS "ownerId", l."product_id" AS "productId", p."price" AS "productPrice",
                 c."currency_uuid" AS "currencyUuid", c."exchange_currency_uuid" AS "exchangeCurrencyUuid",
                 u."checkout_data_policy" AS "checkoutDataPolicy", l."expires_at" AS "expiresAt", l."link_type" AS "linkType"
          FROM "app"."payment_link" l JOIN "app"."product" p ON p."id" = l."product_id" AND p."owner_id" = l."owner_id"
          JOIN "app"."catalog_currency_pair" c ON c."id" = l."currency_pair_id" JOIN "app"."user" u ON u."id" = l."owner_id"
          WHERE l."identifier" = ${identifier} AND l."active" = true AND p."active" = true AND (l."expires_at" IS NULL OR l."expires_at" > ${now})
          FOR UPDATE OF l, p, u
        `;
        const link = locked[0];
        if (!link) return { kind: "unavailable" } as const;
        // Settlement claims acquire this link lock before insert; a new statement observes a claim committed while this lock waited.
        if (link.linkType === "SINGLE_USE" && await tx.paymentLinkSingleUseSettlement.findUnique({ where: { paymentLinkId: link.id }, select: { paymentLinkId: true } })) return { kind: "unavailable" } as const;
        const snapshot = normalizeCustomerSnapshotV1(link.checkoutDataPolicy, customer);
        if (!snapshot) return { kind: "invalid" } as const;
        const retryKeyVerifier = digest(key, `checkout-retry:${retryKey}`);
        const requestVerifier = digest(key, `checkout-request:${link.id}:${retryKeyVerifier}:${link.checkoutDataPolicy}:${canonicalCustomer(snapshot)}`);
        const existing = await tx.checkoutAttempt.findUnique({ where: { paymentLinkId_retryKeyVerifier: { paymentLinkId: link.id, retryKeyVerifier } }, ...record });
        if (existing) return existing.requestVerifier === requestVerifier ? { kind: "replay", attempt: toAttempt(existing) } as const : { kind: "unavailable" } as const;
        const id = randomUUID();
        const nonce = randomBytes(32).toString("base64url");
        const capabilityExpiresAt = new Date(Math.min(link.expiresAt?.getTime() ?? Infinity, now.getTime() + CAPABILITY_TTL_MS));
        const bearer = capability(key, { id, capabilityNonce: nonce, capabilityExpiresAt, capabilityKeyVersion: CAPABILITY_KEY_VERSION });
        const order = await tx.paymentLinkOrder.create({ data: { ownerId: link.ownerId, paymentLinkId: link.id, productId: link.productId, productPrice: link.productPrice, currencyUuid: link.currencyUuid, exchangeCurrencyUuid: link.exchangeCurrencyUuid, checkoutDataPolicy: link.checkoutDataPolicy, name: snapshot.name, email: snapshot.email, cpf: snapshot.cpf, street: snapshot.address?.street ?? null, number: snapshot.address?.number ?? null, district: snapshot.address?.district ?? null, city: snapshot.address?.city ?? null, stateUf: snapshot.address?.stateUf ?? null, postalCode: snapshot.address?.postalCode ?? null, country: snapshot.address?.country ?? null, complement: snapshot.address?.complement ?? null }, select: { id: true } });
        const attempt = await tx.checkoutAttempt.create({ data: { id, ownerId: link.ownerId, paymentLinkId: link.id, paymentLinkOrderId: order.id, retryKeyVerifier, requestVerifier, capabilityNonce: nonce, capabilityKeyVersion: CAPABILITY_KEY_VERSION, capabilityVerifier: createHash("sha256").update(bearer).digest("hex"), capabilityExpiresAt }, ...record });
        return { kind: "created", attempt: toAttempt(attempt), ownerId: link.ownerId, amount: link.productPrice, currencyUuid: link.currencyUuid, exchangeCurrencyUuid: link.exchangeCurrencyUuid } as const;
      });
    },
    async markCreating(id) {
      const result = await db.checkoutAttempt.updateMany({ where: { id, state: "RESERVED" }, data: { state: "CREATING" } });
      return result.count === 1;
    },
    async markPending(id) {
      await db.$transaction(async (tx) => {
        const updated = await tx.checkoutAttempt.updateMany({ where: { id, state: "CREATING" }, data: { state: "PENDING" } });
        if (updated.count === 1) await tx.paymentLinkOrder.updateMany({ where: { checkoutAttempt: { is: { id } }, state: "CREATED" }, data: { state: "PENDING" } });
      });
      const attempt = await db.checkoutAttempt.findUnique({ where: { id }, ...record });
      return attempt ? toAttempt(attempt) : null;
    },
    async markIndeterminate(id) {
      await db.$transaction(async (tx) => {
        const updated = await tx.checkoutAttempt.updateMany({ where: { id, state: { in: ["RESERVED", "CREATING"] } }, data: { state: "INDETERMINATE" } });
        if (updated.count === 1) await tx.paymentLinkOrder.updateMany({ where: { checkoutAttempt: { is: { id } }, state: "CREATED" }, data: { state: "INDETERMINATE" } });
      });
      const attempt = await db.checkoutAttempt.findUnique({ where: { id }, ...record });
      return attempt ? toAttempt(attempt) : null;
    },
  };
}

let shared: ReturnType<typeof createPublicCheckoutService> | undefined;
export function getPublicCheckoutService() {
  shared ??= createPublicCheckoutService(createPrismaCheckoutStore(), { now: () => new Date(), capabilityKey: loadEncryptionKey, provider: createOwnerPricingOrdersService(getNauttCredentialService(), getPricingOrdersAdapter(), createPrismaProviderOrderStore(getDatabaseClient())) });
  return shared;
}

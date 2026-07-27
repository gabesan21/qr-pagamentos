import "server-only";

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { getNauttCredentialService } from "@/auth/nautt-credential";
import { getDatabaseClient } from "@/db/client";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { loadEncryptionKey } from "@/lib/nautt-crypto";
import { normalizeCustomerSnapshotV1, type CheckoutDataPolicy, type CustomerSnapshotV1 } from "@/orders/payment-link-order";
import { createOrderV2Service, createOrderV2Store, type StoredOrderV2 } from "@/orders/order-v2";
import { createOwnerPricingOrdersService } from "@/integrations/nautt/owner-pricing-orders";
import { getPricingOrdersAdapter, NauttOrderCreationIndeterminateError } from "@/integrations/nautt/pricing-orders-client";
import { createPrismaProviderOrderStore } from "@/integrations/nautt/provider-order-store";

// Sessionless Commerce V2 public checkout (9.3.1): the V1 reservation fences
// rebound to checkout_attempt_v2 over payment_link_v2 identities. The browser
// supplies only the 24-character identifier, an opaque retry key, and the
// customer snapshot; owner, policy, currency pair, and the quote amount derive
// from the locked persisted link inside the single reservation transaction.
// Order rows are shaped only by the delivered createFromLink seam, whose own
// transaction nests as a savepoint inside the reservation transaction.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;
const RETRY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const CAPABILITY_KEY_VERSION = "v1";
const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;

type CheckoutAttemptState = "RESERVED" | "CREATING" | "PENDING" | "INDETERMINATE";
type PaymentView = Readonly<{ state: CheckoutAttemptState; pixCopyPaste?: string; pixQrCodeUrl?: string }>;
export type PublicCheckoutV2Result =
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
  paymentLink: Readonly<{ active: boolean; expiresAt: Date | null }>;
  order: Readonly<{ providerOrders: ReadonlyArray<Readonly<{ status: string | null; pixCopyPaste: string | null; pixQrcodeUrl: string | null }>> }>;
}>;

type LockedLink = Readonly<{
  id: string;
  ownerId: string;
  checkoutDataPolicy: CheckoutDataPolicy;
  expiresAt: Date | null;
  linkType: "SINGLE_USE" | "REUSABLE";
}>;

type Reservation = Readonly<{ kind: "created"; attempt: AttemptRecord; ownerId: string; amount: string; currencyUuid: string; exchangeCurrencyUuid: string }>
  | Readonly<{ kind: "replay"; attempt: AttemptRecord }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>;

type CheckoutV2Store = Readonly<{
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

// The only order-shaping seam: the delivered createFromLink service method,
// executed on the open reservation transaction so its internal transaction
// nests as a savepoint and the whole reservation stays one database
// transaction. Returns null when the link's composition is unavailable.
type OrderFromLinkCreator = (transaction: Prisma.TransactionClient, input: Readonly<{ paymentLinkV2Id: string; snapshot: CustomerSnapshotV1 }>) => Promise<StoredOrderV2 | null>;

function createOrderFromLink(transaction: Prisma.TransactionClient, input: Readonly<{ paymentLinkV2Id: string; snapshot: CustomerSnapshotV1 }>): Promise<StoredOrderV2 | null> {
  return createOrderV2Service(createOrderV2Store(transaction as unknown as PrismaClient)).createFromLink(input.paymentLinkV2Id, input.snapshot);
}

function digest(key: Buffer, value: string): string { return createHmac("sha256", key).update(value).digest("hex"); }
function canonicalCustomer(customer: CustomerSnapshotV1): string { return JSON.stringify(customer); }
function capability(key: Buffer, attempt: Pick<AttemptRecord, "id" | "capabilityNonce" | "capabilityExpiresAt" | "capabilityKeyVersion">): string {
  return createHmac("sha256", key).update(`checkout-v2-capability:${attempt.capabilityKeyVersion}:${attempt.id}:${attempt.capabilityExpiresAt.toISOString()}:${attempt.capabilityNonce}`).digest("base64url");
}
function validCapability(key: Buffer, attempt: AttemptRecord, now: Date): string | null {
  if (attempt.capabilityKeyVersion !== CAPABILITY_KEY_VERSION || attempt.capabilityRevokedAt || attempt.capabilityExpiresAt <= now || !attempt.paymentLink.active || (attempt.paymentLink.expiresAt && attempt.paymentLink.expiresAt <= now)) return null;
  const bearer = capability(key, attempt);
  const verifier = createHash("sha256").update(bearer).digest("hex");
  return timingSafeEqual(Buffer.from(verifier), Buffer.from(attempt.capabilityVerifier)) ? bearer : null;
}
function paymentView(attempt: AttemptRecord): PaymentView {
  const order = attempt.order.providerOrders[0];
  if (attempt.state === "PENDING" && order?.status) return { state: "PENDING", ...(order.pixCopyPaste ? { pixCopyPaste: order.pixCopyPaste } : {}), ...(order.pixQrcodeUrl ? { pixQrCodeUrl: order.pixQrcodeUrl } : {}) };
  return { state: attempt.state };
}
function accepted(attempt: AttemptRecord, key: Buffer, now: Date): PublicCheckoutV2Result {
  const statusCapability = validCapability(key, attempt, now);
  if (!statusCapability) return { kind: "unavailable" };
  return { kind: "accepted", status: attempt.state === "PENDING" ? 201 : 202, payment: paymentView(attempt), statusCapability };
}

export function createPublicCheckoutV2Service(store: CheckoutV2Store, dependencies: Dependencies) {
  return {
    async checkout(identifier: unknown, input: unknown): Promise<PublicCheckoutV2Result> {
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

export function createPrismaCheckoutV2Store(db = getDatabaseClient(), key = loadEncryptionKey(), createOrder: OrderFromLinkCreator = createOrderFromLink): CheckoutV2Store {
  const record = { include: { paymentLink: { select: { active: true, expiresAt: true } }, order: { select: { providerOrders: { select: { status: true, pixCopyPaste: true, pixQrcodeUrl: true } } } } } } as const;
  const toAttempt = (value: unknown) => value as AttemptRecord;
  return {
    async reserve({ identifier, retryKey, customer, now }) {
      return db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<LockedLink[]>`
          SELECT l."id", l."owner_id" AS "ownerId", u."checkout_data_policy" AS "checkoutDataPolicy",
                 l."expires_at" AS "expiresAt", l."link_type" AS "linkType"
          FROM "app"."payment_link_v2" l JOIN "app"."user" u ON u."id" = l."owner_id"
          WHERE l."identifier" = ${identifier} AND l."active" = true AND (l."expires_at" IS NULL OR l."expires_at" > ${now})
          FOR UPDATE OF l, u
        `;
        const link = locked[0];
        if (!link) return { kind: "unavailable" } as const;
        // Settlement claims acquire this link lock before insert; a new statement observes a claim committed while this lock waited.
        if (link.linkType === "SINGLE_USE" && await tx.paymentLinkV2SingleUseSettlement.findUnique({ where: { paymentLinkV2Id: link.id }, select: { paymentLinkV2Id: true } })) return { kind: "unavailable" } as const;
        const snapshot = normalizeCustomerSnapshotV1(link.checkoutDataPolicy, customer);
        if (!snapshot) return { kind: "invalid" } as const;
        const retryKeyVerifier = digest(key, `checkout-v2-retry:${retryKey}`);
        const requestVerifier = digest(key, `checkout-v2-request:${link.id}:${retryKeyVerifier}:${link.checkoutDataPolicy}:${canonicalCustomer(snapshot)}`);
        const existing = await tx.checkoutAttemptV2.findUnique({ where: { paymentLinkV2Id_retryKeyVerifier: { paymentLinkV2Id: link.id, retryKeyVerifier } }, ...record });
        if (existing) return existing.requestVerifier === requestVerifier ? { kind: "replay", attempt: toAttempt(existing) } as const : { kind: "unavailable" } as const;
        const order = await createOrder(tx, { paymentLinkV2Id: link.id, snapshot });
        if (!order) return { kind: "unavailable" } as const;
        const id = randomUUID();
        const nonce = randomBytes(32).toString("base64url");
        const capabilityExpiresAt = new Date(Math.min(link.expiresAt?.getTime() ?? Infinity, now.getTime() + CAPABILITY_TTL_MS));
        const bearer = capability(key, { id, capabilityNonce: nonce, capabilityExpiresAt, capabilityKeyVersion: CAPABILITY_KEY_VERSION });
        const attempt = await tx.checkoutAttemptV2.create({ data: { id, ownerId: link.ownerId, paymentLinkV2Id: link.id, orderV2Id: order.id, retryKeyVerifier, requestVerifier, capabilityNonce: nonce, capabilityKeyVersion: CAPABILITY_KEY_VERSION, capabilityVerifier: createHash("sha256").update(bearer).digest("hex"), capabilityExpiresAt, state: "RESERVED", createdAt: now, updatedAt: now }, ...record });
        return { kind: "created", attempt: toAttempt(attempt), ownerId: order.ownerId, amount: order.amount, currencyUuid: order.currencyUuid, exchangeCurrencyUuid: order.exchangeCurrencyUuid } as const;
      });
    },
    async markCreating(id) {
      const result = await db.checkoutAttemptV2.updateMany({ where: { id, state: "RESERVED" }, data: { state: "CREATING" } });
      return result.count === 1;
    },
    async markPending(id) {
      await db.$transaction(async (tx) => {
        const updated = await tx.checkoutAttemptV2.updateMany({ where: { id, state: "CREATING" }, data: { state: "PENDING" } });
        if (updated.count === 1) await tx.orderV2.updateMany({ where: { checkoutAttempt: { is: { id } }, state: "CREATED" }, data: { state: "PENDING" } });
      });
      const attempt = await db.checkoutAttemptV2.findUnique({ where: { id }, ...record });
      return attempt ? toAttempt(attempt) : null;
    },
    async markIndeterminate(id) {
      await db.$transaction(async (tx) => {
        const updated = await tx.checkoutAttemptV2.updateMany({ where: { id, state: { in: ["RESERVED", "CREATING"] } }, data: { state: "INDETERMINATE" } });
        if (updated.count === 1) await tx.orderV2.updateMany({ where: { checkoutAttempt: { is: { id } }, state: "CREATED" }, data: { state: "INDETERMINATE" } });
      });
      const attempt = await db.checkoutAttemptV2.findUnique({ where: { id }, ...record });
      return attempt ? toAttempt(attempt) : null;
    },
  };
}

let shared: ReturnType<typeof createPublicCheckoutV2Service> | undefined;
export function getPublicCheckoutV2Service() {
  shared ??= createPublicCheckoutV2Service(createPrismaCheckoutV2Store(), { now: () => new Date(), capabilityKey: loadEncryptionKey, provider: createOwnerPricingOrdersService(getNauttCredentialService(), getPricingOrdersAdapter(), createPrismaProviderOrderStore(getDatabaseClient())) });
  return shared;
}

import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getDatabaseClient } from "@/db/client";
import { loadEncryptionKey } from "@/lib/nautt-crypto";
import type { PaymentLinkOrderState } from "@/orders/payment-link-order";

// Sessionless Commerce V2 payment status (9.3.1): the same opaque
// capability-only polling contract as the V1 status service, bound to
// checkout_attempt_v2 identities and the V2 order state.
const CAPABILITY_KEY_VERSION = "v1";
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type PublicPaymentStatusV2 = Readonly<{
  state: PaymentLinkOrderState;
  pixCopyPaste?: string;
  pixQrCodeUrl?: string;
}>;

type StatusAttempt = Readonly<{
  id: string;
  capabilityNonce: string;
  capabilityKeyVersion: string;
  capabilityVerifier: string;
  capabilityExpiresAt: Date;
  capabilityRevokedAt: Date | null;
  order: Readonly<{
    state: PaymentLinkOrderState | null;
    providerOrders: ReadonlyArray<Readonly<{ pixCopyPaste: string | null; pixQrcodeUrl: string | null }>>;
  }>;
}>;

export type PublicPaymentStatusV2Store = Readonly<{
  findByCapabilityVerifier(verifier: string): Promise<StatusAttempt | null>;
}>;

function rederiveCapability(key: Buffer, attempt: Pick<StatusAttempt, "id" | "capabilityNonce" | "capabilityExpiresAt" | "capabilityKeyVersion">): string {
  return createHmac("sha256", key)
    .update(`checkout-v2-capability:${attempt.capabilityKeyVersion}:${attempt.id}:${attempt.capabilityExpiresAt.toISOString()}:${attempt.capabilityNonce}`)
    .digest("base64url");
}

function statusView(attempt: StatusAttempt): PublicPaymentStatusV2 | null {
  const payment = attempt.order;
  if (!payment.state) return null;
  const providerOrder = payment.providerOrders[0];
  return {
    state: payment.state,
    ...(payment.state === "PENDING" && providerOrder?.pixCopyPaste ? { pixCopyPaste: providerOrder.pixCopyPaste } : {}),
    ...(payment.state === "PENDING" && providerOrder?.pixQrcodeUrl ? { pixQrCodeUrl: providerOrder.pixQrcodeUrl } : {}),
  };
}

export function createPublicPaymentStatusV2Service(
  store: PublicPaymentStatusV2Store,
  dependencies: Readonly<{ now: () => Date; capabilityKey: () => Buffer }>,
) {
  return {
    async read(value: unknown): Promise<PublicPaymentStatusV2 | null> {
      if (typeof value !== "string" || !CAPABILITY_PATTERN.test(value)) return null;
      let attempt: StatusAttempt | null;
      try {
        attempt = await store.findByCapabilityVerifier(createHash("sha256").update(value).digest("hex"));
      } catch {
        return null;
      }
      if (!attempt || attempt.capabilityKeyVersion !== CAPABILITY_KEY_VERSION || attempt.capabilityRevokedAt || attempt.capabilityExpiresAt <= dependencies.now()) return null;
      let expected: string;
      try {
        expected = rederiveCapability(dependencies.capabilityKey(), attempt);
      } catch {
        return null;
      }
      const verifier = createHash("sha256").update(value).digest("hex");
      if (!timingSafeEqual(Buffer.from(value), Buffer.from(expected)) || !timingSafeEqual(Buffer.from(verifier), Buffer.from(attempt.capabilityVerifier))) return null;
      return statusView(attempt);
    },
  };
}

function prismaStore(): PublicPaymentStatusV2Store {
  const db = getDatabaseClient();
  return {
    findByCapabilityVerifier(capabilityVerifier) {
      return db.checkoutAttemptV2.findFirst({
        where: { capabilityVerifier },
        select: {
          id: true, capabilityNonce: true, capabilityKeyVersion: true, capabilityVerifier: true, capabilityExpiresAt: true, capabilityRevokedAt: true,
          order: { select: { state: true, providerOrders: { select: { pixCopyPaste: true, pixQrcodeUrl: true } } } },
        },
      }) as Promise<StatusAttempt | null>;
    },
  };
}

let shared: ReturnType<typeof createPublicPaymentStatusV2Service> | undefined;
export function getPublicPaymentStatusV2Service() {
  shared ??= createPublicPaymentStatusV2Service(prismaStore(), { now: () => new Date(), capabilityKey: loadEncryptionKey });
  return shared;
}

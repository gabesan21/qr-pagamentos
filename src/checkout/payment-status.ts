import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { getDatabaseClient } from "@/db/client";
import { loadEncryptionKey } from "@/lib/nautt-crypto";
import type { PaymentLinkOrderState } from "@/orders/payment-link-order";

const CAPABILITY_KEY_VERSION = "v1";
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type PublicPaymentStatus = Readonly<{
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
  paymentLinkOrder: Readonly<{
    state: PaymentLinkOrderState;
    providerOrder: Readonly<{ pixCopyPaste: string | null; pixQrcodeUrl: string | null }> | null;
  }>;
}>;

export type PublicPaymentStatusStore = Readonly<{
  findByCapabilityVerifier(verifier: string): Promise<StatusAttempt | null>;
}>;

function rederiveCapability(key: Buffer, attempt: Pick<StatusAttempt, "id" | "capabilityNonce" | "capabilityExpiresAt" | "capabilityKeyVersion">): string {
  return createHmac("sha256", key)
    .update(`checkout-capability:${attempt.capabilityKeyVersion}:${attempt.id}:${attempt.capabilityExpiresAt.toISOString()}:${attempt.capabilityNonce}`)
    .digest("base64url");
}

function statusView(attempt: StatusAttempt): PublicPaymentStatus {
  const payment = attempt.paymentLinkOrder;
  const providerOrder = payment.providerOrder;
  return {
    state: payment.state,
    ...(payment.state === "PENDING" && providerOrder?.pixCopyPaste ? { pixCopyPaste: providerOrder.pixCopyPaste } : {}),
    ...(payment.state === "PENDING" && providerOrder?.pixQrcodeUrl ? { pixQrCodeUrl: providerOrder.pixQrcodeUrl } : {}),
  };
}

export function createPublicPaymentStatusService(
  store: PublicPaymentStatusStore,
  dependencies: Readonly<{ now: () => Date; capabilityKey: () => Buffer }>,
) {
  return {
    async read(value: unknown): Promise<PublicPaymentStatus | null> {
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

function prismaStore(): PublicPaymentStatusStore {
  const db = getDatabaseClient();
  return {
    findByCapabilityVerifier(capabilityVerifier) {
      return db.checkoutAttempt.findFirst({
        where: { capabilityVerifier },
        select: {
          id: true, capabilityNonce: true, capabilityKeyVersion: true, capabilityVerifier: true, capabilityExpiresAt: true, capabilityRevokedAt: true,
          paymentLinkOrder: { select: { state: true, providerOrder: { select: { pixCopyPaste: true, pixQrcodeUrl: true } } } },
        },
      }) as Promise<StatusAttempt | null>;
    },
  };
}

let shared: ReturnType<typeof createPublicPaymentStatusService> | undefined;
export function getPublicPaymentStatusService() {
  shared ??= createPublicPaymentStatusService(prismaStore(), { now: () => new Date(), capabilityKey: loadEncryptionKey });
  return shared;
}

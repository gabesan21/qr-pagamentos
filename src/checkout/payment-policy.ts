import "server-only";

import { getDatabaseClient } from "@/db/client";
import type { PrismaClient } from "@/generated/prisma/client";
import { isObservedPaymentEnabled } from "@/auth/payment-settings";

// Pre-dispatch checkout enforcement (13.4.1 F03): the one policy port both
// checkout services consult after a `created` reservation and before
// spending a quote or calling the provider. Reads the settings row and the
// (owner, pair) evidence row fresh through Prisma on every call -- no
// caching, no background refresh -- and defers the enabled-observation
// comparison entirely to the shared predicate in `payment-settings.ts`.
// Never imports F02's verification/probe service, which answers a
// different question (selection eligibility, not dispatch enforcement).
// A pair with no recorded observation yet is never refused here: the probe
// already gated its selection, and this module cannot claim PIX/BRL proof
// the documentation itself does not support.
export type CheckoutPaymentPolicy = Readonly<{
  refuseDispatch(input: Readonly<{ ownerId: string; currencyUuid: string; exchangeCurrencyUuid: string }>): Promise<boolean>;
}>;

function logRefusal(input: Readonly<{
  ownerId: string;
  currencyUuid: string;
  exchangeCurrencyUuid: string;
  observedPaymentMethod: string;
  observedCurrencySymbol: string;
  reason: string;
}>): void {
  // Redacted single-line record: pair identity, the observed method/currency
  // and the reason, never customer data, credentials or provider bodies.
  try {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "warn",
      event: "checkout.payment_policy.refused",
      ownerId: input.ownerId,
      currencyUuid: input.currencyUuid,
      exchangeCurrencyUuid: input.exchangeCurrencyUuid,
      observedPaymentMethod: input.observedPaymentMethod,
      observedCurrencySymbol: input.observedCurrencySymbol,
      reason: input.reason,
    }));
  } catch {
    // Logging never alters the refusal outcome.
  }
}

export function createCheckoutPaymentPolicy(db: PrismaClient = getDatabaseClient()): CheckoutPaymentPolicy {
  return {
    async refuseDispatch({ ownerId, currencyUuid, exchangeCurrencyUuid }) {
      const pair = await db.catalogCurrencyPair.findUnique({
        where: { currencyUuid_exchangeCurrencyUuid: { currencyUuid, exchangeCurrencyUuid } },
        select: { id: true },
      });
      // No registered pair row for this reservation's UUIDs is not this
      // module's question to answer; the reservation already derived the
      // pair from locked persisted state.
      if (!pair) return false;
      const verification = await db.currencyPairVerification.findUnique({
        where: { ownerId_pairId: { ownerId, pairId: pair.id } },
        select: { observedPaymentMethod: true, observedCurrencySymbol: true },
      });
      const observedPaymentMethod = verification?.observedPaymentMethod;
      const observedCurrencySymbol = verification?.observedCurrencySymbol;
      // A pair with no observation yet still dispatches (see module note).
      if (!observedPaymentMethod || !observedCurrencySymbol) return false;
      const settings = await db.globalPaymentSettings.findUnique({
        where: { id: 1 },
        select: { currencies: true, paymentMethods: true },
      });
      if (!settings) throw new Error("Global payment settings singleton is missing");
      const enabled = isObservedPaymentEnabled(settings, { paymentMethod: observedPaymentMethod, currencySymbol: observedCurrencySymbol });
      if (enabled) return false;
      logRefusal({ ownerId, currencyUuid, exchangeCurrencyUuid, observedPaymentMethod, observedCurrencySymbol, reason: "not_enabled_by_global_payment_settings" });
      return true;
    },
  };
}

let shared: CheckoutPaymentPolicy | undefined;
export function getCheckoutPaymentPolicy(): CheckoutPaymentPolicy {
  shared ??= createCheckoutPaymentPolicy();
  return shared;
}

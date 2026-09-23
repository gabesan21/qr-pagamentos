import "server-only";

import { getDatabaseClient } from "../db/client";
import { requireUserPrincipal, type Principal } from "./authorization";
import { createPaymentLinkV2Store, type PaymentLinkV2Store } from "./payment-link-v2";

// Owner-only management prefill seam (8.2.2): the mutation facade and the
// redacted directory view deliberately expose neither the optimistic-concurrency
// `version` nor line `productId`s, so edit/new-version forms read exactly those
// members here over the delivered store. Cross-owner, malformed, and missing
// identities share the one opaque `null` outcome.
//
// 14.5.2 (F02): an additive `hasCheckoutAttempt` flag rides the same read,
// reusing the store's existing attempt-existence seam (8.1.3's real
// `checkout_attempt_v2` count) so the edit form can render the financial
// lock and the new-version banner only when an attempt genuinely exists,
// instead of unconditionally.
export type PaymentLinkV2Prefill = Readonly<{
  version: number;
  lineProductIds: ReadonlyArray<string>;
  hasCheckoutAttempt: boolean;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPaymentLinkV2PrefillService(store: Pick<PaymentLinkV2Store, "findOwned" | "hasCheckoutAttempt">) {
  return {
    async getForOwner(actor: Principal, id: unknown): Promise<PaymentLinkV2Prefill | null> {
      requireUserPrincipal(actor);
      if (typeof id !== "string" || !UUID_PATTERN.test(id)) return null;
      const normalizedId = id.toLowerCase();
      const link = await store.findOwned(actor.id, normalizedId);
      if (!link) return null;
      const hasCheckoutAttempt = await store.hasCheckoutAttempt(link.id);
      return { version: link.version, lineProductIds: link.lines.map((line) => line.productId), hasCheckoutAttempt };
    },
  };
}

export function getPaymentLinkV2PrefillService() {
  return createPaymentLinkV2PrefillService(createPaymentLinkV2Store(getDatabaseClient()));
}

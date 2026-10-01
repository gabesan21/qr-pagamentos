import "server-only";

import { getDatabaseClient } from "../db/client";

// Active-catalog listing for the payment-link v2 create/edit forms:
// products and currency pairs are shared catalog data (not V1-specific),
// relocated here out of the deleted V1 `payment-link.ts` (15.1.1 F03).
export type PaymentLinkProduct = Readonly<{
  id: string;
  internalName: string;
  titlePtBr: string;
  titleEn: string;
  price: string;
}>;

// Additive: the pair's ISO 4217 code rides the existing
// `supported_exchange_currency` pointer relation (`code` -> `pair_id`), so the
// create form can render the honest per-currency amount treatment without
// guessing a currency from the label. A pair without a live pointer (never
// registered, or deactivated) reads as `null`; no schema or migration changes.
export type PaymentLinkCurrencyPair = Readonly<{ id: string; label: string; currencyCode: string | null }>;

export function listActivePaymentLinkProducts(ownerId: string): Promise<PaymentLinkProduct[]> {
  const db = getDatabaseClient();
  return db.product.findMany({
    where: { ownerId, active: true },
    orderBy: [{ internalName: "asc" }, { id: "asc" }],
    select: { id: true, internalName: true, titlePtBr: true, titleEn: true, price: true },
  });
}

export function listActivePaymentLinkCurrencyPairs(): Promise<PaymentLinkCurrencyPair[]> {
  const db = getDatabaseClient();
  return Promise.all([
    db.catalogCurrencyPair.findMany({
      where: { active: true },
      orderBy: [{ label: "asc" }, { id: "asc" }],
      select: { id: true, label: true, currencyUuid: true },
    }),
    // One pointer row per code, each attached to a single pair; the identity
    // `currencyUuid -> code` map is authoritative, so every pair sharing that
    // currency resolves the same code (the pointer's own pair included).
    db.supportedExchangeCurrency.findMany({ select: { code: true, pair: { select: { currencyUuid: true } } } }),
  ]).then(([pairs, pointers]) => {
    const codeByCurrencyUuid = new Map(pointers.map((pointer) => [pointer.pair.currencyUuid, pointer.code]));
    return pairs.map((pair) => ({ id: pair.id, label: pair.label, currencyCode: codeByCurrencyUuid.get(pair.currencyUuid) ?? null }));
  });
}

// Owner-scoped, additive companion to the pair listing used by the edit form:
// the currency code of the immutable pair already bound to one owned link,
// read through the same pointer relation. Identity-exact (never a label
// match) and read-only; a malformed or cross-owner identifier resolves to
// `null` exactly like a pair without a live pointer.
export function findPaymentLinkV2CurrencyCode(ownerId: string, linkId: string): Promise<string | null> {
  const db = getDatabaseClient();
  return db.paymentLinkV2
    .findFirst({
      where: { id: linkId, ownerId },
      select: { currencyPair: { select: { currencyUuid: true } } },
    })
    .then(async (link) => {
      const currencyUuid = link?.currencyPair.currencyUuid;
      if (currencyUuid === undefined) return null;
      // Identity resolution through the pointer's own pair, so the code is the
      // one bound to the currency regardless of which pair owns the pointer.
      const pointer = await db.supportedExchangeCurrency.findFirst({ where: { pair: { currencyUuid } }, select: { code: true } });
      return pointer?.code ?? null;
    });
}

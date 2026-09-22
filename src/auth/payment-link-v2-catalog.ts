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
export type PaymentLinkCurrencyPair = Readonly<{ id: string; label: string }>;

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
  return db.catalogCurrencyPair.findMany({
    where: { active: true },
    orderBy: [{ label: "asc" }, { id: "asc" }],
    select: { id: true, label: true },
  });
}

import "server-only";

import { getDatabaseClient } from "@/db/client";
import type { SupportedLocale } from "@/i18n/locales";
import type { CheckoutDataPolicy } from "@/orders/payment-link-order";

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export type PublicCheckoutPresentation = Readonly<{
  product: Readonly<{ title: string; description: string; price: string }>;
  checkoutPolicy: CheckoutDataPolicy;
}>;

export type PublicCheckoutPresentationRecord = Readonly<{
  product: Readonly<{ titlePtBr: string; titleEn: string; descriptionPtBr: string; descriptionEn: string; price: string }>;
  owner: Readonly<{ checkoutDataPolicy: CheckoutDataPolicy }>;
}>;

export type PublicCheckoutPresentationStore = Readonly<{
  findAvailableByIdentifier(identifier: string, now: Date): Promise<PublicCheckoutPresentationRecord | null>;
}>;

export function createPublicCheckoutPresentationService(
  store: PublicCheckoutPresentationStore,
  now: () => Date = () => new Date(),
) {
  return {
    async read(identifier: unknown, locale: SupportedLocale): Promise<PublicCheckoutPresentation | null> {
      if (typeof identifier !== "string" || !IDENTIFIER_PATTERN.test(identifier)) return null;
      const record = await store.findAvailableByIdentifier(identifier, now());
      if (!record) return null;
      const localized = locale === "pt-BR"
        ? { title: record.product.titlePtBr, description: record.product.descriptionPtBr }
        : { title: record.product.titleEn, description: record.product.descriptionEn };
      return { product: { ...localized, price: record.product.price }, checkoutPolicy: record.owner.checkoutDataPolicy };
    },
  };
}

function prismaStore(): PublicCheckoutPresentationStore {
  const db = getDatabaseClient();
  return {
    findAvailableByIdentifier(identifier, now) {
      return db.paymentLink.findFirst({
        where: { identifier, active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], product: { is: { active: true } } },
        select: {
          product: { select: { titlePtBr: true, titleEn: true, descriptionPtBr: true, descriptionEn: true, price: true } },
          owner: { select: { checkoutDataPolicy: true } },
        },
      }) as Promise<PublicCheckoutPresentationRecord | null>;
    },
  };
}

export function getPublicCheckoutPresentationService() {
  return createPublicCheckoutPresentationService(prismaStore());
}

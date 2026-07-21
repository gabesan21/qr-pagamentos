import "server-only";

import { getDatabaseClient } from "../db/client";
import type { SupportedLocale } from "../i18n/locales";

export type PublicPaymentLink = Readonly<{
  product: Readonly<{
    title: string;
    description: string;
    price: string;
  }>;
  currencyPair: Readonly<{
    currencyUuid: string;
    exchangeCurrencyUuid: string;
  }>;
}>;

export type PublicPaymentLinkRecord = Readonly<{
  product: Readonly<{
    titlePtBr: string;
    titleEn: string;
    descriptionPtBr: string;
    descriptionEn: string;
    price: string;
  }>;
  currencyPair: Readonly<{
    currencyUuid: string;
    exchangeCurrencyUuid: string;
  }>;
}>;

export type PublicPaymentLinkStore = Readonly<{
  findAvailableByIdentifier(identifier: string, now: Date): Promise<PublicPaymentLinkRecord | null>;
}>;

type Dependencies = Readonly<{
  now: () => Date;
}>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;
const runtimeDependencies: Dependencies = { now: () => new Date() };

function isPaymentLinkIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

function projectPaymentLink(record: PublicPaymentLinkRecord, locale: SupportedLocale): PublicPaymentLink {
  const product = locale === "pt-BR"
    ? { title: record.product.titlePtBr, description: record.product.descriptionPtBr }
    : { title: record.product.titleEn, description: record.product.descriptionEn };

  return {
    product: { ...product, price: record.product.price },
    currencyPair: {
      currencyUuid: record.currencyPair.currencyUuid,
      exchangeCurrencyUuid: record.currencyPair.exchangeCurrencyUuid,
    },
  };
}

export function createPublicPaymentLinkService(
  store: PublicPaymentLinkStore,
  dependencies: Dependencies = runtimeDependencies,
) {
  return {
    async read(identifier: unknown, locale: SupportedLocale): Promise<PublicPaymentLink | null> {
      if (!isPaymentLinkIdentifier(identifier)) return null;

      const record = await store.findAvailableByIdentifier(identifier, dependencies.now());
      return record ? projectPaymentLink(record, locale) : null;
    },
  };
}

function prismaStore(): PublicPaymentLinkStore {
  const db = getDatabaseClient();
  return {
    findAvailableByIdentifier(identifier, now) {
      return db.paymentLink.findFirst({
        where: {
          identifier,
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          product: { is: { active: true } },
        },
        select: {
          product: {
            select: {
              titlePtBr: true,
              titleEn: true,
              descriptionPtBr: true,
              descriptionEn: true,
              price: true,
            },
          },
          currencyPair: {
            select: {
              currencyUuid: true,
              exchangeCurrencyUuid: true,
            },
          },
        },
      });
    },
  };
}

export function getPublicPaymentLinkService() {
  return createPublicPaymentLinkService(prismaStore());
}

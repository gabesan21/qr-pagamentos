import "server-only";

import { getDatabaseClient } from "../db/client";
import type { SupportedLocale } from "../i18n/locales";

// Additive V2 public resolution: only the composition and the pair UUIDs
// required for quoting join the frozen V1 surface. No identifier, owner, state,
// version, timestamp, or other provider data ever leaves this boundary.
export type PublicPaymentLinkV2 = Readonly<{
  composition: Readonly<
    | Readonly<{
      kind: "PRODUCT_LINES";
      lines: ReadonlyArray<Readonly<{
        product: Readonly<{ title: string; description: string; price: string }>;
        quantity: number;
      }>>;
    }>
    | Readonly<{
      kind: "FIXED_AMOUNT";
      description: string;
      amount: string;
    }>
  >;
  currencyPair: Readonly<{
    currencyUuid: string;
    exchangeCurrencyUuid: string;
  }>;
}>;

export type PublicPaymentLinkV2Record = Readonly<{
  compositionKind: "PRODUCT_LINES" | "FIXED_AMOUNT";
  descriptionPtBr: string | null;
  descriptionEn: string | null;
  amount: string | null;
  lines: ReadonlyArray<Readonly<{
    quantity: number;
    product: Readonly<{
      titlePtBr: string;
      titleEn: string;
      descriptionPtBr: string;
      descriptionEn: string;
      price: string;
    }>;
  }>>;
  currencyPair: Readonly<{
    currencyUuid: string;
    exchangeCurrencyUuid: string;
  }>;
}>;

export type PublicPaymentLinkV2Store = Readonly<{
  findAvailableByIdentifier(identifier: string, now: Date): Promise<PublicPaymentLinkV2Record | null>;
}>;

type Dependencies = Readonly<{
  now: () => Date;
}>;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;
const runtimeDependencies: Dependencies = { now: () => new Date() };

function isPaymentLinkIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

function projectPaymentLinkV2(record: PublicPaymentLinkV2Record, locale: SupportedLocale): PublicPaymentLinkV2 | null {
  let composition: PublicPaymentLinkV2["composition"];
  if (record.compositionKind === "FIXED_AMOUNT") {
    // Fail closed on a composition the database check makes impossible.
    const description = locale === "pt-BR" ? record.descriptionPtBr : record.descriptionEn;
    if (description === null || record.amount === null) return null;
    composition = { kind: "FIXED_AMOUNT", description, amount: record.amount };
  } else {
    if (record.lines.length === 0) return null;
    composition = {
      kind: "PRODUCT_LINES",
      lines: record.lines.map((line) => ({
        product: locale === "pt-BR"
          ? { title: line.product.titlePtBr, description: line.product.descriptionPtBr, price: line.product.price }
          : { title: line.product.titleEn, description: line.product.descriptionEn, price: line.product.price },
        quantity: line.quantity,
      })),
    };
  }

  return {
    composition,
    currencyPair: {
      currencyUuid: record.currencyPair.currencyUuid,
      exchangeCurrencyUuid: record.currencyPair.exchangeCurrencyUuid,
    },
  };
}

export function createPublicPaymentLinkV2Service(
  store: PublicPaymentLinkV2Store,
  dependencies: Dependencies = runtimeDependencies,
) {
  return {
    async read(identifier: unknown, locale: SupportedLocale): Promise<PublicPaymentLinkV2 | null> {
      if (!isPaymentLinkIdentifier(identifier)) return null;

      const record = await store.findAvailableByIdentifier(identifier, dependencies.now());
      return record ? projectPaymentLinkV2(record, locale) : null;
    },
  };
}

export function createPublicPaymentLinkV2Store(db: ReturnType<typeof getDatabaseClient>): PublicPaymentLinkV2Store {
  return {
    async findAvailableByIdentifier(identifier, now) {
      const link = await db.paymentLinkV2.findFirst({
        where: {
          identifier,
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: {
          compositionKind: true,
          descriptionPtBr: true,
          descriptionEn: true,
          amount: true,
          lines: {
            select: {
              quantity: true,
              product: {
                select: {
                  titlePtBr: true,
                  titleEn: true,
                  descriptionPtBr: true,
                  descriptionEn: true,
                  price: true,
                  active: true,
                },
              },
            },
            orderBy: { position: "asc" },
          },
          currencyPair: {
            select: {
              currencyUuid: true,
              exchangeCurrencyUuid: true,
            },
          },
        },
      });
      // V1 deactivation semantics: a link whose composition references a
      // publicly inactive product is unavailable, indistinguishable from
      // malformed, missing, inactive, or expired.
      if (!link || link.lines.some((line) => !line.product.active)) return null;
      const { lines, ...record } = link;
      return {
        ...record,
        compositionKind: record.compositionKind as PublicPaymentLinkV2Record["compositionKind"],
        lines: lines.map(({ product: { active: _active, ...product }, quantity }) => ({ quantity, product })),
      };
    },
  };
}

export function getPublicPaymentLinkV2Service() {
  return createPublicPaymentLinkV2Service(createPublicPaymentLinkV2Store(getDatabaseClient()));
}

import "server-only";

import { getDatabaseClient } from "../db/client";
import { DEFAULT_STOREFRONT_THEME_ID } from "../design-system/themes";
import type { SupportedLocale } from "../i18n/locales";

const STOREFRONT_SLUG_PATTERN = /^[a-z0-9](-?[a-z0-9])*$/;
const STOREFRONT_SLUG_MAXIMUM_LENGTH = 63;
const DEFAULT_STOREFRONT_LAYOUT = "boxed";

export type PublicStorefrontProduct = Readonly<{
  title: string;
  description: string;
  price: string;
  paymentLinkIdentifier: string;
}>;

export type PublicStorefront = Readonly<{
  displayName: string | null;
  accentColor: string | null;
  themeId: string;
  layout: string;
  logoMediaIdentifier: string | null;
  products: readonly PublicStorefrontProduct[];
}>;

export type PublicStorefrontRecord = Readonly<{
  storefrontDisplayNamePtBr: string | null;
  storefrontDisplayNameEn: string | null;
  storefrontAccentColor: string | null;
  storefrontThemeId: string | null;
  storefrontLayout: string | null;
  storefrontLogoMediaIdentifier: string | null;
  products: readonly Readonly<{
    titlePtBr: string;
    titleEn: string;
    descriptionPtBr: string;
    descriptionEn: string;
    price: string;
    paymentLinks: readonly Readonly<{ identifier: string }>[];
  }>[];
}>;

export type PublicStorefrontStore = Readonly<{
  findEnabledBySlug(slug: string, now: Date): Promise<PublicStorefrontRecord | null>;
}>;

function isStorefrontSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= STOREFRONT_SLUG_MAXIMUM_LENGTH && STOREFRONT_SLUG_PATTERN.test(value);
}

function localizeStorefront(record: PublicStorefrontRecord, locale: SupportedLocale): PublicStorefront {
  const displayName = locale === "pt-BR" ? record.storefrontDisplayNamePtBr : record.storefrontDisplayNameEn;
  const products = record.products.flatMap((product) => {
    const paymentLinkIdentifier = product.paymentLinks[0]?.identifier;
    if (!paymentLinkIdentifier) return [];
    const localized = locale === "pt-BR"
      ? { title: product.titlePtBr, description: product.descriptionPtBr }
      : { title: product.titleEn, description: product.descriptionEn };
    return [{ ...localized, price: product.price, paymentLinkIdentifier }];
  });

  // Resolved presentation facts only: theme/layout fall back to the design
  // system defaults; the logo identifier stays opaque and `/media/[identifier]`
  // 404s for any non-ACTIVE object. Currency, toggles, and owner data never
  // reach this projection.
  return {
    displayName,
    accentColor: record.storefrontAccentColor,
    themeId: record.storefrontThemeId ?? DEFAULT_STOREFRONT_THEME_ID,
    layout: record.storefrontLayout ?? DEFAULT_STOREFRONT_LAYOUT,
    logoMediaIdentifier: record.storefrontLogoMediaIdentifier,
    products,
  };
}

export function createPublicStorefrontService(store: PublicStorefrontStore, now: () => Date = () => new Date()) {
  return {
    async read(slug: unknown, locale: SupportedLocale): Promise<PublicStorefront | null> {
      if (!isStorefrontSlug(slug)) return null;
      const record = await store.findEnabledBySlug(slug, now());
      return record ? localizeStorefront(record, locale) : null;
    },
  };
}

function prismaStore(): PublicStorefrontStore {
  const db = getDatabaseClient();
  return {
    findEnabledBySlug(slug, now) {
      return db.user.findFirst({
        where: { storefrontSlug: slug, storefrontEnabled: true },
        select: {
          storefrontDisplayNamePtBr: true,
          storefrontDisplayNameEn: true,
          storefrontAccentColor: true,
          storefrontThemeId: true,
          storefrontLayout: true,
          storefrontLogoMediaIdentifier: true,
          products: {
            where: {
              active: true,
              paymentLinks: { some: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } },
            },
            orderBy: [{ internalName: "asc" }, { id: "asc" }],
            select: {
              titlePtBr: true,
              titleEn: true,
              descriptionPtBr: true,
              descriptionEn: true,
              price: true,
              paymentLinks: {
                where: { active: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: 1,
                select: { identifier: true },
              },
            },
          },
        },
      });
    },
  };
}

export function getPublicStorefrontService() {
  return createPublicStorefrontService(prismaStore());
}

import "server-only";

import { getDatabaseClient } from "../db/client";
import { DEFAULT_STOREFRONT_THEME_ID } from "../design-system/themes";
import type { SupportedLocale } from "../i18n/locales";

const STOREFRONT_SLUG_PATTERN = /^[a-z0-9](-?[a-z0-9])*$/;
const STOREFRONT_SLUG_MAXIMUM_LENGTH = 63;
const DEFAULT_STOREFRONT_LAYOUT = "boxed";
const PUBLIC_CATALOG_CATEGORY_LIMIT = 100;
const PUBLIC_CATALOG_PRODUCT_LIMIT = 500;

export type PublicStorefrontProduct = Readonly<{
  title: string;
  description: string;
  price: string;
  paymentLinkIdentifier: string;
}>;

export type PublicStorefrontCatalogProduct = Readonly<{
  // The canonical product UUID is the deliberate opaque cart reference: it is
  // unguessable, grants no authority, and every later cart command revalidates
  // it server-side. It is the only internal identifier this projection exposes.
  reference: string;
  title: string;
  description: string;
  price: string;
  // Display metadata only: the product's stored code, else the store default;
  // never a provider pair UUID or an inactive-code discovery surface.
  currencyCode: string | null;
  imageMediaIdentifier: string | null;
  available: boolean;
}>;

export type PublicStorefrontCatalogGroup = Readonly<{
  // Localized active-category name; null marks the uncategorized group, which
  // always sorts after every named group. Category UUIDs never leave the store.
  name: string | null;
  products: readonly PublicStorefrontCatalogProduct[];
}>;

export type PublicStorefront = Readonly<{
  displayName: string | null;
  accentColor: string | null;
  themeId: string;
  layout: string;
  logoMediaIdentifier: string | null;
  products: readonly PublicStorefrontProduct[];
  catalog: readonly PublicStorefrontCatalogGroup[];
  // Derived capability for the future standalone-payment entry point; the raw
  // toggle and every other settings value stay server-side.
  standalonePayments: boolean;
}>;

export type PublicStorefrontCatalogCategoryRecord = Readonly<{
  id: string;
  namePtBr: string;
  nameEn: string;
}>;

export type PublicStorefrontCatalogProductRecord = Readonly<{
  id: string;
  categoryId: string | null;
  titlePtBr: string;
  titleEn: string;
  descriptionPtBr: string;
  descriptionEn: string;
  price: string;
  currencyCode: string | null;
  imageMediaId: string | null;
}>;

export type PublicStorefrontRecord = Readonly<{
  storefrontDisplayNamePtBr: string | null;
  storefrontDisplayNameEn: string | null;
  storefrontAccentColor: string | null;
  storefrontThemeId: string | null;
  storefrontLayout: string | null;
  storefrontLogoMediaIdentifier: string | null;
  storefrontStandalonePaymentsEnabled: boolean;
  storefrontDefaultCurrencyCode: string | null;
  products: readonly Readonly<{
    titlePtBr: string;
    titleEn: string;
    descriptionPtBr: string;
    descriptionEn: string;
    price: string;
    paymentLinks: readonly Readonly<{ identifier: string }>[];
  }>[];
  catalog: Readonly<{
    categories: readonly PublicStorefrontCatalogCategoryRecord[];
    products: readonly PublicStorefrontCatalogProductRecord[];
  }>;
}>;

export type PublicStorefrontStore = Readonly<{
  findEnabledBySlug(slug: string, now: Date): Promise<PublicStorefrontRecord | null>;
}>;

function isStorefrontSlug(value: unknown): value is string {
  return typeof value === "string" && value.length <= STOREFRONT_SLUG_MAXIMUM_LENGTH && STOREFRONT_SLUG_PATTERN.test(value);
}

function localizeCatalog(record: PublicStorefrontRecord, locale: SupportedLocale): readonly PublicStorefrontCatalogGroup[] {
  const activeCategoryIds = new Set(record.catalog.categories.map((category) => category.id));
  const productsByCategoryId = new Map<string, PublicStorefrontCatalogProduct[]>();
  const uncategorized: PublicStorefrontCatalogProduct[] = [];

  for (const product of record.catalog.products) {
    const localized = locale === "pt-BR"
      ? { title: product.titlePtBr, description: product.descriptionPtBr }
      : { title: product.titleEn, description: product.descriptionEn };
    const entry: PublicStorefrontCatalogProduct = {
      ...localized,
      reference: product.id,
      price: product.price,
      currencyCode: product.currencyCode ?? record.storefrontDefaultCurrencyCode,
      imageMediaIdentifier: product.imageMediaId,
      // Catalog membership is the availability definition: the store query
      // admits only active, non-archived products, so every member is available.
      available: true,
    };
    if (product.categoryId && activeCategoryIds.has(product.categoryId)) {
      const group = productsByCategoryId.get(product.categoryId) ?? [];
      group.push(entry);
      productsByCategoryId.set(product.categoryId, group);
    } else {
      // A product whose category is absent or inactive falls back to the
      // uncategorized group rather than exposing the category identity.
      uncategorized.push(entry);
    }
  }

  const groups: PublicStorefrontCatalogGroup[] = [];
  for (const category of record.catalog.categories) {
    const products = productsByCategoryId.get(category.id);
    if (!products || products.length === 0) continue;
    groups.push({ name: locale === "pt-BR" ? category.namePtBr : category.nameEn, products });
  }
  if (uncategorized.length > 0) groups.push({ name: null, products: uncategorized });
  return groups;
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
  // system defaults; the logo and image identifiers stay opaque and
  // `/media/[identifier]` 404s for any non-ACTIVE object. Owner identity,
  // credential/provider data, raw toggle values, and internal fields never
  // reach this projection.
  return {
    displayName,
    accentColor: record.storefrontAccentColor,
    themeId: record.storefrontThemeId ?? DEFAULT_STOREFRONT_THEME_ID,
    layout: record.storefrontLayout ?? DEFAULT_STOREFRONT_LAYOUT,
    logoMediaIdentifier: record.storefrontLogoMediaIdentifier,
    products,
    catalog: localizeCatalog(record, locale),
    standalonePayments: record.storefrontStandalonePaymentsEnabled,
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
    async findEnabledBySlug(slug, now) {
      const row = await db.user.findFirst({
        where: { storefrontSlug: slug, storefrontEnabled: true },
        select: {
          id: true,
          storefrontDisplayNamePtBr: true,
          storefrontDisplayNameEn: true,
          storefrontAccentColor: true,
          storefrontThemeId: true,
          storefrontLayout: true,
          storefrontLogoMediaIdentifier: true,
          storefrontStandalonePaymentsEnabled: true,
          storefrontDefaultCurrencyCode: true,
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
      if (!row) return null;

      // The owner id scopes the two catalog reads and never leaves the store.
      const { id: ownerId, ...storefront } = row;
      const [categories, catalogProducts] = await Promise.all([
        db.productCategory.findMany({
          where: { ownerId, active: true },
          orderBy: [{ namePtBr: "asc" }, { id: "asc" }],
          take: PUBLIC_CATALOG_CATEGORY_LIMIT,
          select: { id: true, namePtBr: true, nameEn: true },
        }),
        db.product.findMany({
          where: { ownerId, active: true, archivedAt: null },
          orderBy: [{ internalName: "asc" }, { id: "asc" }],
          take: PUBLIC_CATALOG_PRODUCT_LIMIT,
          select: {
            id: true,
            categoryId: true,
            titlePtBr: true,
            titleEn: true,
            descriptionPtBr: true,
            descriptionEn: true,
            price: true,
            currencyCode: true,
            imageMediaId: true,
          },
        }),
      ]);
      return { ...storefront, catalog: { categories, products: catalogProducts } };
    },
  };
}

export function getPublicStorefrontService() {
  return createPublicStorefrontService(prismaStore());
}

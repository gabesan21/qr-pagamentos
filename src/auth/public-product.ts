import "server-only";

import { getDatabaseClient } from "../db/client";
import type { SupportedLocale } from "../i18n/locales";

export type PublicProduct = {
  title: string;
  description: string;
  price: string;
};

export type PublicProductRecord = {
  titlePtBr: string;
  titleEn: string;
  descriptionPtBr: string;
  descriptionEn: string;
  price: string;
};

export type PublicProductStore = {
  findActiveById(id: string): Promise<PublicProductRecord | null>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canonicalUuid(value: unknown): string | null {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function projectProduct(product: PublicProductRecord, locale: SupportedLocale): PublicProduct {
  const localizedFields = {
    "pt-BR": { title: product.titlePtBr, description: product.descriptionPtBr },
    en: { title: product.titleEn, description: product.descriptionEn },
  } satisfies Record<SupportedLocale, Pick<PublicProduct, "title" | "description">>;

  return { ...localizedFields[locale], price: product.price };
}

export function createPublicProductService(store: PublicProductStore) {
  return {
    async read(id: unknown, locale: SupportedLocale): Promise<PublicProduct | null> {
      const canonicalId = canonicalUuid(id);
      if (!canonicalId) return null;

      const product = await store.findActiveById(canonicalId);
      return product ? projectProduct(product, locale) : null;
    },
  };
}

function prismaStore(): PublicProductStore {
  const db = getDatabaseClient();
  return {
    findActiveById(id) {
      return db.product.findFirst({
        where: { id, active: true },
        select: {
          titlePtBr: true,
          titleEn: true,
          descriptionPtBr: true,
          descriptionEn: true,
          price: true,
        },
      });
    },
  };
}

export function getPublicProductService() {
  return createPublicProductService(prismaStore());
}

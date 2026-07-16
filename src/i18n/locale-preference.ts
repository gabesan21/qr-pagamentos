import "server-only";

import { getDatabaseClient } from "../db/client";
import { defaultLocale, isSupportedLocale, type SupportedLocale } from "./locales";

export interface LocalePreferenceStore {
  find(userId: string): Promise<SupportedLocale | null>;
  seed(userId: string, candidate: SupportedLocale): Promise<SupportedLocale>;
  set(userId: string, locale: SupportedLocale): Promise<void>;
}

export function createLocalePreferenceService(store: LocalePreferenceStore) {
  return {
    async resolve(userId: string, candidate?: SupportedLocale) {
      const saved = await store.find(userId);
      if (saved) return saved;
      return store.seed(userId, candidate ?? defaultLocale);
    },
    async set(userId: string, locale: string) {
      if (!isSupportedLocale(locale)) throw new Error("Invalid locale");
      await store.set(userId, locale);
    },
  };
}

function prismaStore(): LocalePreferenceStore {
  const db = getDatabaseClient();
  return {
    async find(userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { preferredLocale: true } });
      return user?.preferredLocale && isSupportedLocale(user.preferredLocale) ? user.preferredLocale : null;
    },
    async seed(userId, candidate) {
      await db.user.updateMany({ where: { id: userId, preferredLocale: null }, data: { preferredLocale: candidate } });
      const saved = await this.find(userId);
      return saved ?? defaultLocale;
    },
    async set(userId, locale) { await db.user.update({ where: { id: userId }, data: { preferredLocale: locale } }); },
  };
}

export function getLocalePreferenceService() { return createLocalePreferenceService(prismaStore()); }

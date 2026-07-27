import { getDatabaseClient } from "../db/client";
import { DEFAULT_STOREFRONT_THEME_ID, isStorefrontThemeId } from "../design-system/themes";
import { ForbiddenError, type Principal } from "./authorization";

export const SYSTEM_SETTINGS_SINGLETON_ID = 1;

export class SystemSettingsValidationError extends Error {}

export type SystemSettingsStore = {
  readDefaultThemeId(): Promise<string | null>;
  saveDefaultThemeId(themeId: string): Promise<void>;
};

function requireAdmin(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

// The empty singleton start resolves to the design-system code constant; only a
// persisted administrator choice overrides it, and only for users created later.
export function effectiveDefaultThemeId(persisted: string | null): string {
  return persisted ?? DEFAULT_STOREFRONT_THEME_ID;
}

export function createSystemSettingsService(store: SystemSettingsStore) {
  return {
    async getDefaultTheme(actor: Principal) {
      requireAdmin(actor);
      return effectiveDefaultThemeId(await store.readDefaultThemeId());
    },
    async saveDefaultTheme(actor: Principal, themeId: unknown) {
      requireAdmin(actor);
      if (!isStorefrontThemeId(themeId)) throw new SystemSettingsValidationError("Invalid default theme");
      await store.saveDefaultThemeId(themeId);
    },
    // Server-side creation-time stamping primitive for account creation; never
    // wired to a route and never applied to existing rows.
    async resolveDefaultThemeId(): Promise<string> {
      return effectiveDefaultThemeId(await store.readDefaultThemeId());
    },
  };
}

function prismaStore(): SystemSettingsStore {
  const db = getDatabaseClient();
  return {
    async readDefaultThemeId() {
      const row = await db.systemSettings.findUnique({ where: { id: SYSTEM_SETTINGS_SINGLETON_ID }, select: { defaultThemeId: true } });
      return row?.defaultThemeId ?? null;
    },
    async saveDefaultThemeId(themeId) {
      await db.systemSettings.upsert({
        where: { id: SYSTEM_SETTINGS_SINGLETON_ID },
        create: { id: SYSTEM_SETTINGS_SINGLETON_ID, defaultThemeId: themeId },
        update: { defaultThemeId: themeId },
      });
    },
  };
}

export function getSystemSettingsService() {
  return createSystemSettingsService(prismaStore());
}

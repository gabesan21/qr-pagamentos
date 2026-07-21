import { getDatabaseClient } from "../db/client";
import { ForbiddenError, type Principal } from "./authorization";

export type StorefrontSettingsData = Readonly<{
  storefrontSlug: string | null;
  storefrontDisplayNamePtBr: string | null;
  storefrontDisplayNameEn: string | null;
  storefrontAccentColor: string | null;
  storefrontEnabled: boolean;
}>;

export class StorefrontSettingsValidationError extends Error {}
export class StorefrontSettingsConflictError extends Error {}

export type StorefrontSettingsStore = Readonly<{
  get(ownerId: string): Promise<StorefrontSettingsData | null>;
  set(ownerId: string, values: StorefrontSettingsData): Promise<StorefrontSettingsData | null>;
}>;

const SLUG_PATTERN = /^[a-z0-9](-?[a-z0-9])*$/;
const ACCENT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const SLUG_MAXIMUM_LENGTH = 63;
const DISPLAY_NAME_MAXIMUM_LENGTH = 160;

function requireActiveActor(actor: Principal) {
  if (actor.status !== "ACTIVE") throw new ForbiddenError("Active account access is required");
}

function validateSlug(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > SLUG_MAXIMUM_LENGTH || !SLUG_PATTERN.test(value)) {
    throw new StorefrontSettingsValidationError("Storefront slug is invalid");
  }
  return value;
}

function validateDisplayName(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new StorefrontSettingsValidationError(`${field} is invalid`);
  const name = value.normalize("NFC").trim();
  if (name === "") return null;
  if (/[\r\n]/.test(name) || [...name].length > DISPLAY_NAME_MAXIMUM_LENGTH) {
    throw new StorefrontSettingsValidationError(`${field} is invalid`);
  }
  return name;
}

function validateAccentColor(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !ACCENT_COLOR_PATTERN.test(value)) {
    throw new StorefrontSettingsValidationError("Storefront accent color is invalid");
  }
  return value.toUpperCase();
}

function validateEnabled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new StorefrontSettingsValidationError("Storefront enabled state is invalid");
}

function validateValues(input: Record<keyof StorefrontSettingsData, unknown>): StorefrontSettingsData {
  const values: StorefrontSettingsData = {
    storefrontSlug: validateSlug(input.storefrontSlug),
    storefrontDisplayNamePtBr: validateDisplayName(input.storefrontDisplayNamePtBr, "Portuguese display name"),
    storefrontDisplayNameEn: validateDisplayName(input.storefrontDisplayNameEn, "English display name"),
    storefrontAccentColor: validateAccentColor(input.storefrontAccentColor),
    storefrontEnabled: validateEnabled(input.storefrontEnabled),
  };
  if (values.storefrontEnabled && values.storefrontSlug === null) {
    throw new StorefrontSettingsValidationError("Enabling a storefront requires a valid slug");
  }
  return values;
}

function requireSettings(data: StorefrontSettingsData | null): StorefrontSettingsData {
  if (!data) throw new ForbiddenError("Active account access is required");
  return data;
}

export function createStorefrontSettingsService(store: StorefrontSettingsStore) {
  return {
    async getForOwner(actor: Principal) {
      requireActiveActor(actor);
      return requireSettings(await store.get(actor.id));
    },
    async update(actor: Principal, input: Record<keyof StorefrontSettingsData, unknown>) {
      requireActiveActor(actor);
      return requireSettings(await store.set(actor.id, validateValues(input)));
    },
  };
}

function isSlugCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  return Array.isArray(target)
    ? target.includes("user_storefront_slug_key") || target.includes("storefrontSlug")
    : target === "user_storefront_slug_key" || target === "storefrontSlug";
}

function prismaStore(): StorefrontSettingsStore {
  const db = getDatabaseClient();
  const select = {
    storefrontSlug: true,
    storefrontDisplayNamePtBr: true,
    storefrontDisplayNameEn: true,
    storefrontAccentColor: true,
    storefrontEnabled: true,
  } as const;
  return {
    async get(ownerId) {
      return db.user.findUnique({ where: { id: ownerId }, select });
    },
    async set(ownerId, values) {
      try {
        const result = await db.user.updateMany({ where: { id: ownerId, status: "ACTIVE" }, data: values });
        if (result.count !== 1) return null;
        return values;
      } catch (error) {
        if (isSlugCollision(error)) throw new StorefrontSettingsConflictError("Storefront slug is not available");
        throw error;
      }
    },
  };
}

export function getStorefrontSettingsService() {
  return createStorefrontSettingsService(prismaStore());
}

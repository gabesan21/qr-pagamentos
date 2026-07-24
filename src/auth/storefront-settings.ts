import { getDatabaseClient } from "../db/client";
import { isStorefrontThemeId } from "../design-system/themes";
import { getMediaService } from "../media/media-service";
import { MEDIA_IDENTIFIER_PATTERN } from "../media/types";
import { ForbiddenError, requireUserPrincipal, type Principal } from "./authorization";
import { getSupportedExchangeCurrencyService } from "./supported-exchange-currency";

export type StorefrontSettingsData = Readonly<{
  storefrontSlug: string | null;
  storefrontDisplayNamePtBr: string | null;
  storefrontDisplayNameEn: string | null;
  storefrontAccentColor: string | null;
  storefrontEnabled: boolean;
  storefrontThemeId: string | null;
  storefrontLayout: string | null;
  storefrontLogoMediaIdentifier: string | null;
  storefrontStandalonePaymentsEnabled: boolean;
  storefrontDefaultCurrencyCode: string | null;
}>;

// Absent (undefined) keys leave the stored value unchanged; explicit null or
// blank input clears the nullable fields. This keeps legacy forms that submit
// only the original fields from silently wiping the extended settings.
export type StorefrontSettingsInput = Readonly<Partial<Record<keyof StorefrontSettingsData, unknown>>>;

export class StorefrontSettingsValidationError extends Error {}
export class StorefrontSettingsConflictError extends Error {}

export type StorefrontSettingsStore = Readonly<{
  get(ownerId: string): Promise<StorefrontSettingsData | null>;
  set(ownerId: string, values: StorefrontSettingsData): Promise<StorefrontSettingsData | null>;
}>;

// Narrow ports so the media revision fence and the currency registry stay
// owned by their own services; this module only orchestrates them.
export type StorefrontSettingsDeps = Readonly<{
  requireActiveCurrencyPair(code: string): Promise<unknown>;
  activateOwnedLogo(actor: Principal, identifier: string): Promise<unknown>;
  orphanOwnedLogo(actor: Principal, identifier: string): Promise<unknown>;
}>;

const SLUG_PATTERN = /^[a-z0-9](-?[a-z0-9])*$/;
const ACCENT_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;
const STOREFRONT_LAYOUTS = ["boxed", "table"] as const;
const SLUG_MAXIMUM_LENGTH = 63;
const DISPLAY_NAME_MAXIMUM_LENGTH = 160;

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

function validateToggle(value: unknown, field: string): boolean {
  if (value === null || value === undefined) return false;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new StorefrontSettingsValidationError(`${field} is invalid`);
}

function validateThemeId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isStorefrontThemeId(value)) {
    throw new StorefrontSettingsValidationError("Storefront theme is invalid");
  }
  return value;
}

function validateLayout(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !(STOREFRONT_LAYOUTS as readonly string[]).includes(value)) {
    throw new StorefrontSettingsValidationError("Storefront layout is invalid");
  }
  return value;
}

function validateLogoMediaIdentifier(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !MEDIA_IDENTIFIER_PATTERN.test(value)) {
    throw new StorefrontSettingsValidationError("Storefront logo is invalid");
  }
  return value;
}

function validateDefaultCurrencyCode(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !CURRENCY_CODE_PATTERN.test(value)) {
    throw new StorefrontSettingsValidationError("Storefront default currency is invalid");
  }
  return value;
}

type StorefrontSettingsPatch = { -readonly [K in keyof StorefrontSettingsData]?: StorefrontSettingsData[K] };

function validatePatch(input: StorefrontSettingsInput): StorefrontSettingsPatch {
  const patch: StorefrontSettingsPatch = {};
  if (input.storefrontSlug !== undefined) patch.storefrontSlug = validateSlug(input.storefrontSlug);
  if (input.storefrontDisplayNamePtBr !== undefined) {
    patch.storefrontDisplayNamePtBr = validateDisplayName(input.storefrontDisplayNamePtBr, "Portuguese display name");
  }
  if (input.storefrontDisplayNameEn !== undefined) {
    patch.storefrontDisplayNameEn = validateDisplayName(input.storefrontDisplayNameEn, "English display name");
  }
  if (input.storefrontAccentColor !== undefined) patch.storefrontAccentColor = validateAccentColor(input.storefrontAccentColor);
  if (input.storefrontEnabled !== undefined) patch.storefrontEnabled = validateToggle(input.storefrontEnabled, "Storefront enabled state");
  if (input.storefrontThemeId !== undefined) patch.storefrontThemeId = validateThemeId(input.storefrontThemeId);
  if (input.storefrontLayout !== undefined) patch.storefrontLayout = validateLayout(input.storefrontLayout);
  if (input.storefrontLogoMediaIdentifier !== undefined) {
    patch.storefrontLogoMediaIdentifier = validateLogoMediaIdentifier(input.storefrontLogoMediaIdentifier);
  }
  if (input.storefrontStandalonePaymentsEnabled !== undefined) {
    patch.storefrontStandalonePaymentsEnabled = validateToggle(input.storefrontStandalonePaymentsEnabled, "Standalone payments enabled state");
  }
  if (input.storefrontDefaultCurrencyCode !== undefined) {
    patch.storefrontDefaultCurrencyCode = validateDefaultCurrencyCode(input.storefrontDefaultCurrencyCode);
  }
  return patch;
}

function requireSettings(data: StorefrontSettingsData | null): StorefrontSettingsData {
  if (!data) throw new ForbiddenError("Active account access is required");
  return data;
}

export function createStorefrontSettingsService(store: StorefrontSettingsStore, deps: StorefrontSettingsDeps) {
  return {
    async getForOwner(actor: Principal) {
      requireUserPrincipal(actor);
      return requireSettings(await store.get(actor.id));
    },
    async update(actor: Principal, input: StorefrontSettingsInput) {
      requireUserPrincipal(actor);
      const current = requireSettings(await store.get(actor.id));
      const patch = validatePatch(input);
      const merged: StorefrontSettingsData = { ...current, ...patch };
      if (merged.storefrontEnabled && merged.storefrontSlug === null) {
        throw new StorefrontSettingsValidationError("Enabling a storefront requires a valid slug");
      }
      // New assignments gate on the registry; a stored code keeps reading
      // as-is even after its mapping is later deactivated.
      if (patch.storefrontDefaultCurrencyCode) {
        await deps.requireActiveCurrencyPair(patch.storefrontDefaultCurrencyCode);
      }
      const previousLogo = current.storefrontLogoMediaIdentifier;
      const nextLogo = merged.storefrontLogoMediaIdentifier;
      const logoChanged = patch.storefrontLogoMediaIdentifier !== undefined && nextLogo !== previousLogo;
      if (logoChanged && nextLogo !== null) {
        await deps.activateOwnedLogo(actor, nextLogo);
      }
      let saved: StorefrontSettingsData;
      try {
        saved = requireSettings(await store.set(actor.id, merged));
      } catch (error) {
        // Compensate the just-activated logo so a failed save never leaves an
        // ACTIVE object the row does not reference; worst case is a
        // quota-counted ACTIVE object, never a broken reference.
        if (logoChanged && nextLogo !== null) {
          try {
            await deps.orphanOwnedLogo(actor, nextLogo);
          } catch {
            // Best effort: the unreferenced ACTIVE object stays quota-counted.
          }
        }
        throw error;
      }
      if (logoChanged && previousLogo !== null) {
        await deps.orphanOwnedLogo(actor, previousLogo);
      }
      return saved;
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
    storefrontThemeId: true,
    storefrontLayout: true,
    storefrontLogoMediaIdentifier: true,
    storefrontStandalonePaymentsEnabled: true,
    storefrontDefaultCurrencyCode: true,
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
  const media = getMediaService();
  const registry = getSupportedExchangeCurrencyService();
  return createStorefrontSettingsService(prismaStore(), {
    requireActiveCurrencyPair: (code) => registry.requireActivePair(code),
    activateOwnedLogo: (actor, identifier) => media.activateOwned(actor, identifier, "STOREFRONT_LOGO"),
    orphanOwnedLogo: (actor, identifier) => media.orphanOwned(actor, identifier, "STOREFRONT_LOGO"),
  });
}

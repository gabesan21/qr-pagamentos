import "server-only";

import { getDatabaseClient } from "../db/client";
import { isSupportedLocale, type SupportedLocale } from "../i18n/locales";
import { ForbiddenError, type Principal } from "./authorization";
import { CHECKOUT_DATA_POLICIES, type CheckoutDataPolicy } from "./checkout-policy";
import { normalizeOptionalEmail, normalizeUsername } from "./identity";
import { acquireUserSessionLock } from "./session";
import {
  createDatabaseSupportedExchangeCurrencyStore,
  getSupportedExchangeCurrencyService,
  NoActiveExchangeCurrencyMappingError,
  type ExchangeCurrencyChoice,
} from "./supported-exchange-currency";
import {
  StorefrontSettingsValidationError,
  validateAdminStorefrontPatch,
  type AdminStorefrontSettingsPatch,
  type StorefrontSettingsInput,
} from "./storefront-settings";

// Administrator-over-user profile mutations (10.3.3): identity (expected-
// version CAS), locale, checkout data policy, and storefront corrections
// against an explicit target id. The administrator is re-authorized on every
// call and writes by target id directly — no owner-scoped service is ever
// invoked with a fabricated principal. Role, status, and password stay on the
// byte-frozen administration routes; nothing here touches credentials,
// sessions (no revocation — these fields are not authorization material),
// the owner-fenced logo media lifecycle, provider data, or audit rows. A
// soft-deleted target is indistinguishable from an unknown one and shares the
// one opaque unavailable outcome.

export class AdminUserProfileValidationError extends Error {}
export class AdminUserProfileConflictError extends Error {}
export class AdminUserProfileUnavailableError extends Error {}

type AdminStorefrontValues = Required<AdminStorefrontSettingsPatch>;

export type AdminUserProfileTarget = Readonly<{
  deletedAt: Date | null;
  storefront: AdminStorefrontValues;
}>;

export type LockedAdminUserProfileStore = Readonly<{
  findTarget(targetId: string): Promise<AdminUserProfileTarget | null>;
  updateLocale(targetId: string, locale: SupportedLocale | null): Promise<void>;
  updateCheckoutPolicy(targetId: string, policy: CheckoutDataPolicy): Promise<void>;
  updateStorefront(targetId: string, values: AdminStorefrontValues): Promise<"changed" | "conflict">;
}>;

export type AdminUserProfileStore = LockedAdminUserProfileStore & Readonly<{
  updateIdentity(
    targetId: string,
    expectedVersion: number,
    values: Readonly<{ username: string; email: string | null }>,
  ): Promise<"changed" | "conflict" | "unavailable">;
  withUserLock<T>(targetId: string, work: (locked: LockedAdminUserProfileStore) => Promise<T>): Promise<T>;
}>;

// Narrow ports: the currency registry stays owned by its own service; this
// module only orchestrates the gating primitive and the redacted choice read.
export type AdminUserProfileDeps = Readonly<{
  requireActiveCurrencyPair(code: string): Promise<unknown>;
  listActiveCurrencyChoices(): Promise<readonly ExchangeCurrencyChoice[]>;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const MAX_DATABASE_INTEGER = 2_147_483_647;

function requireAdmin(actor: Principal) {
  if (actor.role !== "ADMIN" || actor.status !== "ACTIVE") throw new ForbiddenError("Administrator access is required");
}

function parseTargetId(targetId: unknown): string {
  if (typeof targetId !== "string" || !UUID_PATTERN.test(targetId)) {
    throw new AdminUserProfileUnavailableError("Administrator profile target is unavailable");
  }
  return targetId.toLowerCase();
}

// Soft deletion is terminal: a marked target is indistinguishable from an
// unknown one for every administrator profile mutation.
function requireMutableTarget(target: AdminUserProfileTarget | null): AdminUserProfileTarget {
  if (!target || target.deletedAt !== null) {
    throw new AdminUserProfileUnavailableError("Administrator profile target is unavailable");
  }
  return target;
}

function parseExpectedVersion(value: unknown): number {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new AdminUserProfileValidationError("Profile version is invalid");
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version > MAX_DATABASE_INTEGER) {
    throw new AdminUserProfileValidationError("Profile version is invalid");
  }
  return version;
}

function parseIdentity(input: Readonly<{ username: unknown; email: unknown; expectedVersion: unknown }>) {
  try {
    return {
      username: normalizeUsername(String(input.username)),
      email: normalizeOptionalEmail(typeof input.email === "string" ? input.email : null),
      expectedVersion: parseExpectedVersion(input.expectedVersion),
    };
  } catch (error) {
    if (error instanceof AdminUserProfileValidationError) throw error;
    throw new AdminUserProfileValidationError("Profile identity input is invalid");
  }
}

function parseLocale(value: unknown): SupportedLocale | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && isSupportedLocale(value)) return value;
  throw new AdminUserProfileValidationError("Profile locale is invalid");
}

function parseCheckoutPolicy(value: unknown): CheckoutDataPolicy {
  if (typeof value === "string" && CHECKOUT_DATA_POLICIES.includes(value as CheckoutDataPolicy)) {
    return value as CheckoutDataPolicy;
  }
  throw new AdminUserProfileValidationError("Checkout data policy is invalid");
}

function parseStorefrontPatch(input: StorefrontSettingsInput): AdminStorefrontSettingsPatch {
  try {
    return validateAdminStorefrontPatch(input);
  } catch (error) {
    if (error instanceof StorefrontSettingsValidationError) {
      throw new AdminUserProfileValidationError("Storefront input is invalid");
    }
    throw error;
  }
}

export function createAdminUserProfileService(store: AdminUserProfileStore, deps: AdminUserProfileDeps) {
  return {
    // The editor's currency select reads only the redacted active choices.
    async listActiveCurrencyChoices(actor: Principal) {
      requireAdmin(actor);
      return deps.listActiveCurrencyChoices();
    },

    // Merchant-profile CAS precedent: one conflict outcome for a stale
    // expected version or a username/email unique collision; sessions are
    // retained and nothing is revoked.
    async updateIdentity(
      actor: Principal,
      targetId: unknown,
      input: Readonly<{ username: unknown; email: unknown; expectedVersion: unknown }>,
    ) {
      requireAdmin(actor);
      const id = parseTargetId(targetId);
      const identity = parseIdentity(input);
      const outcome = await store.updateIdentity(id, identity.expectedVersion, {
        username: identity.username,
        email: identity.email,
      });
      if (outcome === "conflict") throw new AdminUserProfileConflictError("Profile identity update conflicts");
      if (outcome === "unavailable") throw new AdminUserProfileUnavailableError("Administrator profile target is unavailable");
    },

    // Locale, checkout policy, and storefront writes are single-writer
    // administrator corrections: no CAS, one user-locked transaction each.
    async updateLocale(actor: Principal, targetId: unknown, input: Readonly<{ locale: unknown }>) {
      requireAdmin(actor);
      const id = parseTargetId(targetId);
      const locale = parseLocale(input.locale);
      await store.withUserLock(id, async (locked) => {
        requireMutableTarget(await locked.findTarget(id));
        await locked.updateLocale(id, locale);
      });
    },

    async updateCheckoutPolicy(actor: Principal, targetId: unknown, input: Readonly<{ policy: unknown }>) {
      requireAdmin(actor);
      const id = parseTargetId(targetId);
      const policy = parseCheckoutPolicy(input.policy);
      await store.withUserLock(id, async (locked) => {
        requireMutableTarget(await locked.findTarget(id));
        await locked.updateCheckoutPolicy(id, policy);
      });
    },

    async updateStorefront(actor: Principal, targetId: unknown, input: StorefrontSettingsInput) {
      requireAdmin(actor);
      const id = parseTargetId(targetId);
      const patch = parseStorefrontPatch(input);
      await store.withUserLock(id, async (locked) => {
        const target = requireMutableTarget(await locked.findTarget(id));
        const merged: AdminStorefrontValues = { ...target.storefront, ...patch };
        if (merged.storefrontEnabled && merged.storefrontSlug === null) {
          throw new AdminUserProfileValidationError("Enabling a storefront requires a valid slug");
        }
        // New assignments gate on the registry; a stored code keeps reading
        // as-is even after its mapping is later deactivated (merchant rule).
        if (patch.storefrontDefaultCurrencyCode) {
          try {
            await deps.requireActiveCurrencyPair(patch.storefrontDefaultCurrencyCode);
          } catch (error) {
            if (error instanceof NoActiveExchangeCurrencyMappingError) {
              throw new AdminUserProfileValidationError("Storefront default currency is invalid");
            }
            throw error;
          }
        }
        if (await locked.updateStorefront(id, merged) === "conflict") {
          throw new AdminUserProfileConflictError("Storefront slug is not available");
        }
      });
    },
  };
}

function isUniqueCollision(error: unknown) {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: unknown }).code === "P2002";
}

function prismaStore(): AdminUserProfileStore {
  const db = getDatabaseClient();
  const storefrontSelect = {
    storefrontSlug: true,
    storefrontDisplayNamePtBr: true,
    storefrontDisplayNameEn: true,
    storefrontAccentColor: true,
    storefrontEnabled: true,
    storefrontThemeId: true,
    storefrontLayout: true,
    storefrontStandalonePaymentsEnabled: true,
    storefrontDefaultCurrencyCode: true,
  } as const;
  const scoped = (client: typeof db): LockedAdminUserProfileStore => ({
    async findTarget(targetId) {
      const row = await client.user.findUnique({ where: { id: targetId }, select: { deletedAt: true, ...storefrontSelect } });
      if (!row) return null;
      const { deletedAt, ...storefront } = row;
      return { deletedAt, storefront };
    },
    async updateLocale(targetId, locale) {
      await client.user.update({ where: { id: targetId }, data: { preferredLocale: locale } });
    },
    async updateCheckoutPolicy(targetId, policy) {
      await client.user.update({ where: { id: targetId }, data: { checkoutDataPolicy: policy } });
    },
    async updateStorefront(targetId, values) {
      try {
        await client.user.update({ where: { id: targetId }, data: values });
        return "changed" as const;
      } catch (error) {
        // The slug is the only unique column among the editable set.
        if (isUniqueCollision(error)) return "conflict" as const;
        throw error;
      }
    },
  });
  return {
    ...scoped(db),
    async updateIdentity(targetId, expectedVersion, values) {
      try {
        return await db.$transaction(async (transaction) => {
          const changed = await transaction.user.updateMany({
            where: { id: targetId, deletedAt: null, profileVersion: expectedVersion },
            data: { ...values, profileVersion: { increment: 1 } },
          });
          if (changed.count === 1) return "changed" as const;
          const available = await transaction.user.count({ where: { id: targetId, deletedAt: null } });
          return available === 1 ? "conflict" as const : "unavailable" as const;
        });
      } catch (error) {
        if (isUniqueCollision(error)) return "conflict" as const;
        throw error;
      }
    },
    async withUserLock(targetId, work) {
      return db.$transaction(async (transaction) => {
        await acquireUserSessionLock(transaction, targetId);
        return work(scoped(transaction as typeof db));
      });
    },
  };
}

export function getAdminUserProfileService() {
  const db = getDatabaseClient();
  const registry = getSupportedExchangeCurrencyService();
  const registryStore = createDatabaseSupportedExchangeCurrencyStore(db);
  return createAdminUserProfileService(prismaStore(), {
    requireActiveCurrencyPair: (code) => registry.requireActivePair(code),
    listActiveCurrencyChoices: () => registryStore.listActive(),
  });
}

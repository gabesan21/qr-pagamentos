import { describe, expect, it, vi } from "vitest";

import { ForbiddenError } from "./authorization";
import {
  createStorefrontSettingsService,
  StorefrontSettingsConflictError,
  StorefrontSettingsValidationError,
  type StorefrontSettingsData,
  type StorefrontSettingsStore,
} from "./storefront-settings";

const owner = { id: "owner", username: "owner", email: null, role: "USER" as const, status: "ACTIVE" as const, createdAt: new Date() };
const admin = { ...owner, id: "admin", role: "ADMIN" as const };
const otherOwner = { ...owner, id: "other-owner" };
const disabledOwner = { ...owner, id: "disabled-owner", status: "DISABLED" as const };

const defaults: StorefrontSettingsData = {
  storefrontSlug: null,
  storefrontDisplayNamePtBr: null,
  storefrontDisplayNameEn: null,
  storefrontAccentColor: null,
  storefrontEnabled: false,
};

function store(): StorefrontSettingsStore & { values: Map<string, StorefrontSettingsData> } {
  const values = new Map([[owner.id, { ...defaults }], [otherOwner.id, { ...defaults, storefrontSlug: "taken" }]]);
  return {
    values,
    async get(ownerId) { return values.get(ownerId) ?? null; },
    async set(ownerId, next) {
      if (!values.has(ownerId)) return null;
      if (next.storefrontSlug !== null && values.get(otherOwner.id)?.storefrontSlug === next.storefrontSlug && ownerId !== otherOwner.id) {
        throw new StorefrontSettingsConflictError("Storefront slug is not available");
      }
      values.set(ownerId, next);
      return next;
    },
  };
}

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    storefrontSlug: "my-store",
    storefrontDisplayNamePtBr: "Minha Loja",
    storefrontDisplayNameEn: "My Store",
    storefrontAccentColor: "#1a2B3c",
    storefrontEnabled: true,
    ...overrides,
  };
}

describe("storefront-settings service", () => {
  it("defaults to disabled and changes only the active actor's settings", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore);
    await expect(service.getForOwner(owner)).resolves.toEqual(defaults);
    await expect(service.update(owner, validInput())).resolves.toEqual({
      storefrontSlug: "my-store",
      storefrontDisplayNamePtBr: "Minha Loja",
      storefrontDisplayNameEn: "My Store",
      storefrontAccentColor: "#1A2B3C",
      storefrontEnabled: true,
    });
    expect(testStore.values.get(otherOwner.id)).toEqual({ ...defaults, storefrontSlug: "taken" });
  });

  it("denies administrators before validation or persistence", async () => {
    const get = vi.fn();
    const set = vi.fn();
    const service = createStorefrontSettingsService({ get, set });

    await expect(service.getForOwner(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.update(admin, {} as never)).rejects.toBeInstanceOf(ForbiddenError);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("clears blank optional values to null", async () => {
    const service = createStorefrontSettingsService(store());
    await expect(service.update(owner, validInput({
      storefrontSlug: "",
      storefrontDisplayNamePtBr: "   ",
      storefrontDisplayNameEn: null,
      storefrontAccentColor: "",
      storefrontEnabled: null,
    }))).resolves.toEqual(defaults);
  });

  it("rejects invalid slugs without mutation", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore);
    for (const storefrontSlug of ["My-Store", "-lead", "trail-", "double--dash", "under_score", `a${"-b".repeat(32)}`, 42]) {
      await expect(service.update(owner, validInput({ storefrontSlug, storefrontEnabled: false }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    }
    expect(testStore.values.get(owner.id)).toEqual(defaults);
  });

  it("rejects enabling without a valid slug without mutation", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore);
    await expect(service.update(owner, validInput({ storefrontSlug: null }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    expect(testStore.values.get(owner.id)).toEqual(defaults);
  });

  it("rejects malformed accent colors and multiline or overlong display names without mutation", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore);
    for (const storefrontAccentColor of ["1A2B3C", "#1a2b3", "#1A2B3C4", "#GGGGGG"]) {
      await expect(service.update(owner, validInput({ storefrontAccentColor }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    }
    await expect(service.update(owner, validInput({ storefrontDisplayNamePtBr: "two\nlines" }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    await expect(service.update(owner, validInput({ storefrontDisplayNameEn: "a".repeat(161) }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    expect(testStore.values.get(owner.id)).toEqual(defaults);
  });

  it("surfaces a slug collision as an opaque conflict without mutation", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore);
    await expect(service.update(owner, validInput({ storefrontSlug: "taken" }))).rejects.toBeInstanceOf(StorefrontSettingsConflictError);
    expect(testStore.values.get(owner.id)).toEqual(defaults);
  });

  it("rejects inactive actors for reads and writes", async () => {
    const service = createStorefrontSettingsService(store());
    await expect(service.getForOwner(disabledOwner)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.update(disabledOwner, validInput())).rejects.toBeInstanceOf(ForbiddenError);
  });
});

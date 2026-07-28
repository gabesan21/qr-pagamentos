import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError } from "./authorization";
import { NoActiveExchangeCurrencyMappingError } from "./supported-exchange-currency";
import {
  createStorefrontSettingsService,
  StorefrontSettingsConflictError,
  StorefrontSettingsValidationError,
  type StorefrontSettingsData,
  type StorefrontSettingsDeps,
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
  storefrontThemeId: null,
  storefrontLayout: null,
  storefrontLogoMediaIdentifier: null,
  storefrontStandalonePaymentsEnabled: true,
  storefrontDefaultCurrencyCode: null,
};

function store(
  seed: Partial<StorefrontSettingsData> = {},
  behavior: { onSet?: () => void; setError?: Error } = {},
): StorefrontSettingsStore & { values: Map<string, StorefrontSettingsData> } {
  const values = new Map([[owner.id, { ...defaults, ...seed }], [otherOwner.id, { ...defaults, storefrontSlug: "taken" }]]);
  return {
    values,
    async get(ownerId) { return values.get(ownerId) ?? null; },
    async set(ownerId, next) {
      behavior.onSet?.();
      if (behavior.setError) throw behavior.setError;
      if (!values.has(ownerId)) return null;
      if (next.storefrontSlug !== null && values.get(otherOwner.id)?.storefrontSlug === next.storefrontSlug && ownerId !== otherOwner.id) {
        throw new StorefrontSettingsConflictError("Storefront slug is not available");
      }
      values.set(ownerId, next);
      return next;
    },
  };
}

function deps(overrides: Partial<StorefrontSettingsDeps> = {}) {
  const mocks = {
    requireActiveCurrencyPair: vi.fn(async () => ({})),
    activateOwnedLogo: vi.fn(async () => ({})),
    orphanOwnedLogo: vi.fn(async () => ({})),
  };
  return { ...mocks, ...overrides } as typeof mocks & StorefrontSettingsDeps;
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
    const service = createStorefrontSettingsService(testStore, deps());
    await expect(service.getForOwner(owner)).resolves.toEqual(defaults);
    await expect(service.update(owner, validInput())).resolves.toEqual({
      ...defaults,
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
    const service = createStorefrontSettingsService({ get, set }, deps());

    await expect(service.getForOwner(admin)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.update(admin, {})).rejects.toBeInstanceOf(ForbiddenError);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("clears blank optional values to null", async () => {
    const service = createStorefrontSettingsService(store(), deps());
    await expect(service.update(owner, validInput({
      storefrontSlug: "",
      storefrontDisplayNamePtBr: "   ",
      storefrontDisplayNameEn: null,
      storefrontAccentColor: "",
      storefrontEnabled: null,
      storefrontThemeId: "",
      storefrontLayout: null,
      storefrontLogoMediaIdentifier: "",
      storefrontDefaultCurrencyCode: "",
    }))).resolves.toEqual(defaults);
  });

  it("rejects invalid slugs without mutation", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore, deps());
    for (const storefrontSlug of ["My-Store", "-lead", "trail-", "double--dash", "under_score", `a${"-b".repeat(32)}`, 42]) {
      await expect(service.update(owner, validInput({ storefrontSlug, storefrontEnabled: false }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    }
    expect(testStore.values.get(owner.id)).toEqual(defaults);
  });

  it("rejects enabling without a valid slug without mutation", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore, deps());
    await expect(service.update(owner, validInput({ storefrontSlug: null }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    expect(testStore.values.get(owner.id)).toEqual(defaults);
  });

  it("rejects malformed accent colors and multiline or overlong display names without mutation", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore, deps());
    for (const storefrontAccentColor of ["1A2B3C", "#1a2b3", "#1A2B3C4", "#GGGGGG"]) {
      await expect(service.update(owner, validInput({ storefrontAccentColor }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    }
    await expect(service.update(owner, validInput({ storefrontDisplayNamePtBr: "two\nlines" }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    await expect(service.update(owner, validInput({ storefrontDisplayNameEn: "a".repeat(161) }))).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    expect(testStore.values.get(owner.id)).toEqual(defaults);
  });

  it("surfaces a slug collision as an opaque conflict without mutation", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore, deps());
    await expect(service.update(owner, validInput({ storefrontSlug: "taken" }))).rejects.toBeInstanceOf(StorefrontSettingsConflictError);
    expect(testStore.values.get(owner.id)).toEqual(defaults);
  });

  it("rejects inactive actors for reads and writes", async () => {
    const service = createStorefrontSettingsService(store(), deps());
    await expect(service.getForOwner(disabledOwner)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.update(disabledOwner, validInput())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("scopes every mutation to the actor's own row and cannot touch another owner", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore, deps());

    await service.update(owner, validInput({ storefrontSlug: "owner-store" }));
    expect(testStore.values.get(owner.id)).toMatchObject({ storefrontSlug: "owner-store" });
    expect(testStore.values.get(otherOwner.id)).toEqual({ ...defaults, storefrontSlug: "taken" });
  });

  it("treats a missing or inactive owner row as an access denial on update", async () => {
    const missingOwner = { ...owner, id: "missing-owner" };
    const service = createStorefrontSettingsService(store(), deps());
    await expect(service.update(missingOwner, validInput())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("preserves every extended field on a legacy-only save", async () => {
    const extended = {
      storefrontThemeId: "vault-blue",
      storefrontLayout: "table",
      storefrontLogoMediaIdentifier: "l".repeat(43),
      storefrontStandalonePaymentsEnabled: false,
      storefrontDefaultCurrencyCode: "USD",
    };
    const testStore = store(extended);
    const testDeps = deps();
    const service = createStorefrontSettingsService(testStore, testDeps);
    await expect(service.update(owner, validInput())).resolves.toEqual({
      ...defaults,
      ...extended,
      storefrontSlug: "my-store",
      storefrontDisplayNamePtBr: "Minha Loja",
      storefrontDisplayNameEn: "My Store",
      storefrontAccentColor: "#1A2B3C",
      storefrontEnabled: true,
    });
    expect(testDeps.requireActiveCurrencyPair).not.toHaveBeenCalled();
    expect(testDeps.activateOwnedLogo).not.toHaveBeenCalled();
    expect(testDeps.orphanOwnedLogo).not.toHaveBeenCalled();
  });

  it("validates theme, layout, logo, and currency values before any side effect", async () => {
    const testStore = store();
    const testDeps = deps();
    const service = createStorefrontSettingsService(testStore, testDeps);
    for (const storefrontThemeId of ["neon-glass", "PIX-PAPER", 42]) {
      await expect(service.update(owner, { storefrontThemeId })).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    }
    for (const storefrontLayout of ["grid", "BOXED", 42]) {
      await expect(service.update(owner, { storefrontLayout })).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    }
    for (const storefrontLogoMediaIdentifier of ["short", "x".repeat(44), 42]) {
      await expect(service.update(owner, { storefrontLogoMediaIdentifier })).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    }
    for (const storefrontDefaultCurrencyCode of ["usd", "US", "USDD", "U1D", 42]) {
      await expect(service.update(owner, { storefrontDefaultCurrencyCode })).rejects.toBeInstanceOf(StorefrontSettingsValidationError);
    }
    expect(testStore.values.get(owner.id)).toEqual(defaults);
    expect(testDeps.requireActiveCurrencyPair).not.toHaveBeenCalled();
    expect(testDeps.activateOwnedLogo).not.toHaveBeenCalled();
  });

  it("accepts the closed theme set, both layouts, and the standalone toggle", async () => {
    const testStore = store();
    const service = createStorefrontSettingsService(testStore, deps());
    await expect(service.update(owner, {
      storefrontThemeId: "terminal-amber",
      storefrontLayout: "table",
      storefrontStandalonePaymentsEnabled: "false",
    })).resolves.toEqual({
      ...defaults,
      storefrontThemeId: "terminal-amber",
      storefrontLayout: "table",
      storefrontStandalonePaymentsEnabled: false,
    });
    await expect(service.update(owner, { storefrontStandalonePaymentsEnabled: "true" })).resolves.toMatchObject({
      storefrontStandalonePaymentsEnabled: true,
    });
  });

  it("gates a new currency assignment on an active registry mapping", async () => {
    const testStore = store();
    const testDeps = deps();
    const service = createStorefrontSettingsService(testStore, testDeps);
    await expect(service.update(owner, { storefrontDefaultCurrencyCode: "USD" })).resolves.toMatchObject({
      storefrontDefaultCurrencyCode: "USD",
    });
    expect(testDeps.requireActiveCurrencyPair).toHaveBeenCalledWith("USD");

    testDeps.requireActiveCurrencyPair.mockRejectedValueOnce(new NoActiveExchangeCurrencyMappingError("No active exchange currency mapping"));
    await expect(service.update(owner, { storefrontDefaultCurrencyCode: "ARS" })).rejects.toBeInstanceOf(NoActiveExchangeCurrencyMappingError);
    expect(testStore.values.get(owner.id)?.storefrontDefaultCurrencyCode).toBe("USD");
  });

  it("keeps reading a stored currency code after its mapping is deactivated", async () => {
    const testStore = store({ storefrontDefaultCurrencyCode: "USD" });
    const testDeps = deps({
      requireActiveCurrencyPair: vi.fn(async () => {
        throw new NoActiveExchangeCurrencyMappingError("No active exchange currency mapping");
      }),
    });
    const service = createStorefrontSettingsService(testStore, testDeps);
    await expect(service.getForOwner(owner)).resolves.toMatchObject({ storefrontDefaultCurrencyCode: "USD" });
    // A save that does not re-assign the code never re-gates it.
    await expect(service.update(owner, validInput({ storefrontEnabled: false }))).resolves.toMatchObject({
      storefrontDefaultCurrencyCode: "USD",
    });
    expect(testDeps.requireActiveCurrencyPair).not.toHaveBeenCalled();
  });

  it("replaces a logo by activating the new object, saving, then orphaning the old one", async () => {
    const previous = "p".repeat(43);
    const next = "n".repeat(43);
    const events: string[] = [];
    const testStore = store({ storefrontLogoMediaIdentifier: previous }, { onSet: () => events.push("save") });
    const testDeps = deps({
      activateOwnedLogo: vi.fn(async () => {
        events.push("activate");
      }),
      orphanOwnedLogo: vi.fn(async () => {
        events.push("orphan");
      }),
    });
    const service = createStorefrontSettingsService(testStore, testDeps);
    await expect(service.update(owner, { storefrontLogoMediaIdentifier: next })).resolves.toMatchObject({
      storefrontLogoMediaIdentifier: next,
    });
    expect(testDeps.activateOwnedLogo).toHaveBeenCalledWith(owner, next);
    expect(testDeps.orphanOwnedLogo).toHaveBeenCalledWith(owner, previous);
    expect(events).toEqual(["activate", "save", "orphan"]);
  });

  it("clears a logo by saving null and orphaning the old object without activating", async () => {
    const previous = "p".repeat(43);
    const testStore = store({ storefrontLogoMediaIdentifier: previous });
    const testDeps = deps();
    const service = createStorefrontSettingsService(testStore, testDeps);
    await expect(service.update(owner, { storefrontLogoMediaIdentifier: null })).resolves.toMatchObject({
      storefrontLogoMediaIdentifier: null,
    });
    expect(testDeps.activateOwnedLogo).not.toHaveBeenCalled();
    expect(testDeps.orphanOwnedLogo).toHaveBeenCalledWith(owner, previous);
  });

  it("performs no media work when the logo identifier is unchanged or absent", async () => {
    const current = "l".repeat(43);
    const testStore = store({ storefrontLogoMediaIdentifier: current });
    const testDeps = deps();
    const service = createStorefrontSettingsService(testStore, testDeps);
    await service.update(owner, { storefrontLogoMediaIdentifier: current });
    await service.update(owner, validInput({ storefrontEnabled: false }));
    expect(testDeps.activateOwnedLogo).not.toHaveBeenCalled();
    expect(testDeps.orphanOwnedLogo).not.toHaveBeenCalled();
  });

  it("compensates with a best-effort orphan when the save fails after activation", async () => {
    const next = "n".repeat(43);
    const testStore = store({}, { setError: new Error("database unavailable") });
    const testDeps = deps();
    const service = createStorefrontSettingsService(testStore, testDeps);
    await expect(service.update(owner, { storefrontLogoMediaIdentifier: next })).rejects.toThrow("database unavailable");
    expect(testDeps.activateOwnedLogo).toHaveBeenCalledWith(owner, next);
    expect(testDeps.orphanOwnedLogo).toHaveBeenCalledWith(owner, next);
    expect(testStore.values.get(owner.id)).toEqual(defaults);
  });

  it("still surfaces the original failure when compensation also fails", async () => {
    const next = "n".repeat(43);
    const testStore = store({}, { setError: new Error("database unavailable") });
    const testDeps = deps({
      orphanOwnedLogo: vi.fn(async () => {
        throw new Error("media unavailable");
      }),
    });
    const service = createStorefrontSettingsService(testStore, testDeps);
    await expect(service.update(owner, { storefrontLogoMediaIdentifier: next })).rejects.toThrow("database unavailable");
  });
});

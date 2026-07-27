import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ForbiddenError, type Principal } from "./authorization";
import {
  AdminUserProfileConflictError,
  AdminUserProfileUnavailableError,
  AdminUserProfileValidationError,
  createAdminUserProfileService,
  type AdminUserProfileStore,
  type AdminUserProfileTarget,
  type LockedAdminUserProfileStore,
} from "./admin-user-profile";
import { NoActiveExchangeCurrencyMappingError } from "./supported-exchange-currency";

const admin: Principal = { id: "440e8400-e29b-41d4-a716-446655440001", username: "admin", email: null, role: "ADMIN", status: "ACTIVE", createdAt: new Date() };
const merchant: Principal = { id: "440e8400-e29b-41d4-a716-446655440002", username: "merchant", email: null, role: "USER", status: "ACTIVE", createdAt: new Date() };
const disabledAdmin: Principal = { ...admin, status: "DISABLED" };
const targetId = "440e8400-e29b-41d4-a716-446655440010";

function storefront(overrides: Partial<AdminUserProfileTarget["storefront"]> = {}): AdminUserProfileTarget["storefront"] {
  return {
    storefrontSlug: "padaria",
    storefrontDisplayNamePtBr: "Padaria",
    storefrontDisplayNameEn: "Bakery",
    storefrontAccentColor: "#AA00FF",
    storefrontEnabled: false,
    storefrontThemeId: "pix-paper",
    storefrontLayout: "boxed",
    storefrontStandalonePaymentsEnabled: false,
    storefrontDefaultCurrencyCode: "BRL",
    ...overrides,
  };
}

function target(overrides: Partial<AdminUserProfileTarget> = {}): AdminUserProfileTarget {
  return { deletedAt: null, storefront: storefront(), ...overrides };
}

function createHarness() {
  const locked = {
    findTarget: vi.fn<(id: string) => Promise<AdminUserProfileTarget | null>>(),
    updateLocale: vi.fn(),
    updateCheckoutPolicy: vi.fn(),
    updateStorefront: vi.fn(),
  } satisfies LockedAdminUserProfileStore;
  const store: AdminUserProfileStore = {
    ...locked,
    updateIdentity: vi.fn(),
    withUserLock: vi.fn((_id: string, work: (store: LockedAdminUserProfileStore) => Promise<unknown>) => work(locked)),
  };
  const deps = {
    requireActiveCurrencyPair: vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
    listActiveCurrencyChoices: vi.fn().mockResolvedValue([{ code: "BRL", label: "Brazilian real" }]),
  };
  const service = createAdminUserProfileService(store, deps);
  return { deps, locked, service, store };
}

beforeEach(() => vi.clearAllMocks());

describe("administrator profile authorization", () => {
  it("denies every mutation and the choice read to non-administrators before any store work", async () => {
    const { deps, locked, service, store } = createHarness();
    for (const actor of [merchant, disabledAdmin]) {
      await expect(service.listActiveCurrencyChoices(actor)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(service.updateIdentity(actor, targetId, { username: "new.name", email: "", expectedVersion: "1" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(service.updateLocale(actor, targetId, { locale: "en" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(service.updateCheckoutPolicy(actor, targetId, { policy: "NONE" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(service.updateStorefront(actor, targetId, { storefrontEnabled: true })).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(store.updateIdentity).not.toHaveBeenCalled();
    expect(store.withUserLock).not.toHaveBeenCalled();
    expect(locked.findTarget).not.toHaveBeenCalled();
    expect(deps.listActiveCurrencyChoices).not.toHaveBeenCalled();
  });

  it("lists only the redacted active currency choices for an administrator", async () => {
    const { service } = createHarness();
    await expect(service.listActiveCurrencyChoices(admin)).resolves.toEqual([{ code: "BRL", label: "Brazilian real" }]);
  });
});

describe("administrator profile identity CAS", () => {
  const input = { username: "Renamed.Owner", email: " Owner@Example.COM ", expectedVersion: "3" };

  it("normalizes identity and applies the expected-version CAS without revoking sessions", async () => {
    const { service, store } = createHarness();
    vi.mocked(store.updateIdentity).mockResolvedValue("changed");
    await service.updateIdentity(admin, targetId, input);
    expect(store.updateIdentity).toHaveBeenCalledWith(targetId, 3, { username: "renamed.owner", email: "owner@example.com" });
    expect(store.withUserLock).not.toHaveBeenCalled();
  });

  it("clears a blank email to null", async () => {
    const { service, store } = createHarness();
    vi.mocked(store.updateIdentity).mockResolvedValue("changed");
    await service.updateIdentity(admin, targetId, { ...input, email: "   " });
    expect(store.updateIdentity).toHaveBeenCalledWith(targetId, 3, { username: "renamed.owner", email: null });
  });

  it("shares one conflict outcome for a stale version or a unique collision", async () => {
    const { service, store } = createHarness();
    vi.mocked(store.updateIdentity).mockResolvedValueOnce("conflict");
    await expect(service.updateIdentity(admin, targetId, input)).rejects.toBeInstanceOf(AdminUserProfileConflictError);
  });

  it("maps an unknown or deleted target to the one opaque unavailable outcome", async () => {
    const { service, store } = createHarness();
    vi.mocked(store.updateIdentity).mockResolvedValueOnce("unavailable");
    await expect(service.updateIdentity(admin, targetId, input)).rejects.toBeInstanceOf(AdminUserProfileUnavailableError);
  });

  it.each([
    ["short username", { ...input, username: "ab" }],
    ["invalid email", { ...input, email: "not-an-email" }],
    ["fractional version", { ...input, expectedVersion: "1.5" }],
    ["negative version", { ...input, expectedVersion: "-1" }],
    ["overflow version", { ...input, expectedVersion: "99999999999" }],
  ])("rejects %s as a validation failure without store work", async (_label, bad) => {
    const { service, store } = createHarness();
    await expect(service.updateIdentity(admin, targetId, bad)).rejects.toBeInstanceOf(AdminUserProfileValidationError);
    expect(store.updateIdentity).not.toHaveBeenCalled();
  });
});

describe("administrator profile locale", () => {
  it("sets a supported locale under the user lock after the terminality fence", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target());
    await service.updateLocale(admin, targetId, { locale: "pt-BR" });
    expect(locked.updateLocale).toHaveBeenCalledWith(targetId, "pt-BR");
  });

  it("clears the preference with blank input", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target());
    await service.updateLocale(admin, targetId, { locale: "" });
    expect(locked.updateLocale).toHaveBeenCalledWith(targetId, null);
  });

  it("rejects an unsupported locale without store work", async () => {
    const { locked, service, store } = createHarness();
    await expect(service.updateLocale(admin, targetId, { locale: "fr" })).rejects.toBeInstanceOf(AdminUserProfileValidationError);
    expect(store.withUserLock).not.toHaveBeenCalled();
    expect(locked.updateLocale).not.toHaveBeenCalled();
  });

  it("shares the opaque unavailable outcome for missing and deleted targets", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValueOnce(null);
    await expect(service.updateLocale(admin, targetId, { locale: "en" })).rejects.toBeInstanceOf(AdminUserProfileUnavailableError);
    locked.findTarget.mockResolvedValueOnce(target({ deletedAt: new Date() }));
    await expect(service.updateLocale(admin, targetId, { locale: "en" })).rejects.toBeInstanceOf(AdminUserProfileUnavailableError);
    expect(locked.updateLocale).not.toHaveBeenCalled();
  });
});

describe("administrator profile checkout policy", () => {
  it("accepts every closed policy value", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target());
    for (const policy of ["NONE", "NAME_EMAIL", "EMAIL", "NAME_EMAIL_CPF", "NAME_EMAIL_CPF_ADDRESS"] as const) {
      await service.updateCheckoutPolicy(admin, targetId, { policy });
      expect(locked.updateCheckoutPolicy).toHaveBeenLastCalledWith(targetId, policy);
    }
  });

  it("rejects an unknown policy without store work", async () => {
    const { service, store } = createHarness();
    await expect(service.updateCheckoutPolicy(admin, targetId, { policy: "EVERYTHING" })).rejects.toBeInstanceOf(AdminUserProfileValidationError);
    expect(store.withUserLock).not.toHaveBeenCalled();
  });

  it("shares the opaque unavailable outcome for a deleted target", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target({ deletedAt: new Date() }));
    await expect(service.updateCheckoutPolicy(admin, targetId, { policy: "NONE" })).rejects.toBeInstanceOf(AdminUserProfileUnavailableError);
    expect(locked.updateCheckoutPolicy).not.toHaveBeenCalled();
  });
});

describe("administrator profile storefront", () => {
  it("merges the patch over the stored values and saves under the user lock", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target());
    locked.updateStorefront.mockResolvedValue("changed");
    await service.updateStorefront(admin, targetId, { storefrontDisplayNameEn: "New Bakery", storefrontEnabled: "true" });
    expect(locked.updateStorefront).toHaveBeenCalledWith(targetId, storefront({ storefrontDisplayNameEn: "New Bakery", storefrontEnabled: true }));
  });

  it("rejects enabling without a slug on the merged state", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target({ storefront: storefront({ storefrontSlug: null }) }));
    await expect(service.updateStorefront(admin, targetId, { storefrontEnabled: true })).rejects.toBeInstanceOf(AdminUserProfileValidationError);
    expect(locked.updateStorefront).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid slug", { storefrontSlug: "Bad Slug" }],
    ["invalid accent color", { storefrontAccentColor: "blue" }],
    ["invalid theme", { storefrontThemeId: "neon" }],
    ["invalid layout", { storefrontLayout: "grid" }],
    ["invalid currency code", { storefrontDefaultCurrencyCode: "brl" }],
  ])("rejects %s without store work", async (_label, bad) => {
    const { service, store } = createHarness();
    await expect(service.updateStorefront(admin, targetId, bad)).rejects.toBeInstanceOf(AdminUserProfileValidationError);
    expect(store.withUserLock).not.toHaveBeenCalled();
  });

  it("gates a genuine new currency assignment on the registry", async () => {
    const { deps, locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target({ storefront: storefront({ storefrontDefaultCurrencyCode: null }) }));
    locked.updateStorefront.mockResolvedValue("changed");
    await service.updateStorefront(admin, targetId, { storefrontDefaultCurrencyCode: "USD" });
    expect(deps.requireActiveCurrencyPair).toHaveBeenCalledWith("USD");
    expect(locked.updateStorefront).toHaveBeenCalledWith(targetId, storefront({ storefrontDefaultCurrencyCode: "USD" }));
  });

  it("maps a missing currency mapping to the validation failure", async () => {
    const { deps, locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target());
    deps.requireActiveCurrencyPair.mockRejectedValue(new NoActiveExchangeCurrencyMappingError("none"));
    await expect(service.updateStorefront(admin, targetId, { storefrontDefaultCurrencyCode: "USD" })).rejects.toBeInstanceOf(AdminUserProfileValidationError);
    expect(locked.updateStorefront).not.toHaveBeenCalled();
  });

  it("never gates a cleared or untouched currency assignment", async () => {
    const { deps, locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target());
    locked.updateStorefront.mockResolvedValue("changed");
    await service.updateStorefront(admin, targetId, { storefrontDefaultCurrencyCode: "" });
    await service.updateStorefront(admin, targetId, { storefrontDisplayNamePtBr: "Padoca" });
    expect(deps.requireActiveCurrencyPair).not.toHaveBeenCalled();
  });

  it("maps a slug unique collision to the one conflict outcome", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target());
    locked.updateStorefront.mockResolvedValue("conflict");
    await expect(service.updateStorefront(admin, targetId, { storefrontSlug: "taken" })).rejects.toBeInstanceOf(AdminUserProfileConflictError);
  });

  it("never reads or writes the owner-fenced logo media identifier", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target());
    locked.updateStorefront.mockResolvedValue("changed");
    await service.updateStorefront(admin, targetId, { storefrontLogoMediaIdentifier: "x".repeat(43) } as never);
    expect(locked.updateStorefront).toHaveBeenCalledWith(targetId, storefront());
  });

  it("shares the opaque unavailable outcome for a deleted target", async () => {
    const { locked, service } = createHarness();
    locked.findTarget.mockResolvedValue(target({ deletedAt: new Date() }));
    await expect(service.updateStorefront(admin, targetId, { storefrontEnabled: false })).rejects.toBeInstanceOf(AdminUserProfileUnavailableError);
    expect(locked.updateStorefront).not.toHaveBeenCalled();
  });
});

describe("administrator profile target identity", () => {
  it("rejects malformed target identifiers before any store work", async () => {
    const { service, store } = createHarness();
    await expect(service.updateLocale(admin, "not-a-uuid", { locale: "en" })).rejects.toBeInstanceOf(AdminUserProfileUnavailableError);
    expect(store.withUserLock).not.toHaveBeenCalled();
    expect(store.updateIdentity).not.toHaveBeenCalled();
  });
});

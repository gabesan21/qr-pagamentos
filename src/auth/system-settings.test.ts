import { describe, expect, it } from "vitest";

import { ForbiddenError } from "./authorization";
import {
  createSystemSettingsService,
  effectiveDefaultThemeId,
  SystemSettingsValidationError,
  type SystemSettingsStore,
} from "./system-settings";
import { DEFAULT_STOREFRONT_THEME_ID } from "../design-system/themes";

const principal = (id: string, role: "USER" | "ADMIN" = "ADMIN", status: "ACTIVE" | "DISABLED" = "ACTIVE") => ({
  id,
  username: id,
  email: null,
  role,
  status,
  createdAt: new Date(),
});

function testStore(persisted: string | null = null) {
  let value = persisted;
  const store: SystemSettingsStore = {
    async readDefaultThemeId() { return value; },
    async saveDefaultThemeId(themeId) { value = themeId; },
  };
  return { store, persisted: () => value };
}

describe("system settings service", () => {
  it("resolves the code constant while the singleton row is absent or empty", async () => {
    expect(effectiveDefaultThemeId(null)).toBe(DEFAULT_STOREFRONT_THEME_ID);
    const service = createSystemSettingsService(testStore().store);

    await expect(service.getDefaultTheme(principal("admin"))).resolves.toBe(DEFAULT_STOREFRONT_THEME_ID);
    await expect(service.resolveDefaultThemeId()).resolves.toBe(DEFAULT_STOREFRONT_THEME_ID);
  });

  it("persists a valid six-theme id and resolves it on later reads", async () => {
    const { store, persisted } = testStore();
    const service = createSystemSettingsService(store);

    await service.saveDefaultTheme(principal("admin"), "vault-blue");

    expect(persisted()).toBe("vault-blue");
    await expect(service.getDefaultTheme(principal("admin"))).resolves.toBe("vault-blue");
    await expect(service.resolveDefaultThemeId()).resolves.toBe("vault-blue");
  });

  it("rejects ids outside the closed theme set without touching the store", async () => {
    const { store, persisted } = testStore("pix-paper");
    const service = createSystemSettingsService(store);

    for (const themeId of ["unknown", "PIX-PAPER", "", 42, null]) {
      await expect(service.saveDefaultTheme(principal("admin"), themeId)).rejects.toBeInstanceOf(SystemSettingsValidationError);
    }
    expect(persisted()).toBe("pix-paper");
  });

  it("denies merchants and disabled administrators before any store work", async () => {
    const { store, persisted } = testStore();
    const service = createSystemSettingsService(store);

    await expect(service.getDefaultTheme(principal("owner", "USER"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.saveDefaultTheme(principal("owner", "USER"), "vault-blue")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(service.saveDefaultTheme(principal("admin", "ADMIN", "DISABLED"), "vault-blue")).rejects.toBeInstanceOf(ForbiddenError);
    expect(persisted()).toBeNull();
  });
});

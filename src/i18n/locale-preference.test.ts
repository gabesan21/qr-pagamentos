import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createLocalePreferenceService, type LocalePreferenceStore } from "./locale-preference";

function store(initial: Record<string, "pt-BR" | "en" | null>): LocalePreferenceStore {
  const values = new Map(Object.entries(initial));
  return {
    find: async (userId) => values.get(userId) ?? null,
    seed: async (userId, candidate) => {
      if (values.get(userId) === null) values.set(userId, candidate);
      return values.get(userId) ?? "pt-BR";
    },
    set: async (userId, locale) => { values.set(userId, locale); },
  };
}

describe("locale preference service", () => {
  it("defaults an unseeded user and preserves an explicit selection", async () => {
    const service = createLocalePreferenceService(store({ user: null }));
    expect(await service.resolve("user")).toBe("pt-BR");
    await service.set("user", "en");
    expect(await service.resolve("user", "pt-BR")).toBe("en");
  });

  it("atomically settles concurrent first-seed candidates on one stored value", async () => {
    const service = createLocalePreferenceService(store({ user: null }));
    const resolved = await Promise.all([service.resolve("user", "en"), service.resolve("user", "pt-BR")]);
    expect(new Set(resolved).size).toBe(1);
    expect(["pt-BR", "en"]).toContain(resolved[0]);
  });

  it("rejects values outside the closed locale set", async () => {
    await expect(createLocalePreferenceService(store({ user: null })).set("user", "es")).rejects.toThrow("Invalid locale");
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DARK_SYSTEM_STOREFRONT_THEME_ID,
  DEFAULT_STOREFRONT_THEME_ID,
  isStorefrontThemeId,
  STOREFRONT_THEME_IDS,
} from "./themes";

const resolver = JSON.parse(
  readFileSync(new URL("./tokens/resolver.json", import.meta.url), "utf8"),
) as { modifiers: { theme: { default: string; contexts: Record<string, unknown> } } };

describe("storefront theme ids", () => {
  it("exports exactly the resolver theme contexts with the resolver default", () => {
    expect(STOREFRONT_THEME_IDS).toEqual(Object.keys(resolver.modifiers.theme.contexts));
    expect(DEFAULT_STOREFRONT_THEME_ID).toBe(resolver.modifiers.theme.default);
  });

  it("is the ordered closed set with safe light and dark-system fallbacks", () => {
    expect(STOREFRONT_THEME_IDS).toEqual([
      "pix-paper",
      "cashier-daylight",
      "settlement-sand",
      "midnight-clearing",
      "vault-blue",
      "terminal-amber",
    ]);
    expect(DEFAULT_STOREFRONT_THEME_ID).toBe("pix-paper");
    expect(DARK_SYSTEM_STOREFRONT_THEME_ID).toBe("midnight-clearing");
  });

  it("recognizes only persisted theme ids", () => {
    expect(isStorefrontThemeId("pix-paper")).toBe(true);
    expect(isStorefrontThemeId("neon-glass")).toBe(false);
    expect(isStorefrontThemeId("PIX-PAPER")).toBe(false);
    expect(isStorefrontThemeId(null)).toBe(false);
    expect(isStorefrontThemeId(42)).toBe(false);
  });
});

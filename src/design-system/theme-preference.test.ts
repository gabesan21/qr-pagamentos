import { describe, expect, it } from "vitest";

import { buildThemePreferenceCookie, resolveThemePreference, THEME_PREFERENCE_COOKIE_NAME } from "./theme-preference";
import { STOREFRONT_THEME_IDS } from "./themes";

describe("resolveThemePreference", () => {
  it.each(STOREFRONT_THEME_IDS)("accepts %s, a registered theme id", (themeId) => {
    expect(resolveThemePreference(themeId)).toBe(themeId);
  });

  it("rejects an unknown value", () => {
    expect(resolveThemePreference("not-a-theme")).toBeUndefined();
  });

  it("rejects an absent cookie", () => {
    expect(resolveThemePreference(undefined)).toBeUndefined();
    expect(resolveThemePreference(null)).toBeUndefined();
  });
});

describe("buildThemePreferenceCookie", () => {
  it("names the theme cookie with a one-year max-age and Lax same-site", () => {
    const cookie = buildThemePreferenceCookie("pix-paper", false);
    expect(cookie).toContain(`${THEME_PREFERENCE_COOKIE_NAME}=pix-paper`);
    expect(cookie).toContain("path=/");
    expect(cookie).toContain("max-age=31536000");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
  });

  it("adds Secure only for a secure context", () => {
    const cookie = buildThemePreferenceCookie("vault-blue", true);
    expect(cookie).toContain("Secure");
  });
});

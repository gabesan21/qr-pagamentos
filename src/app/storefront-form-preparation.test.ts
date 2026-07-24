import { describe, expect, it } from "vitest";

import { omitUnchangedExtendedFields } from "./storefront-form-preparation";

const prefill = {
  themeId: "pix-paper",
  layout: "boxed",
  standalonePaymentsEnabled: "true",
  defaultCurrencyCode: "BRL",
} as const;

describe("storefront dirty-field omission", () => {
  it("deletes every extended field that still equals its prefilled value", () => {
    const formData = new FormData();
    formData.set("storefrontSlug", "my-store");
    formData.set("storefrontThemeId", "pix-paper");
    formData.set("storefrontLayout", "boxed");
    formData.set("storefrontStandalonePaymentsEnabled", "true");
    formData.set("storefrontDefaultCurrencyCode", "BRL");
    formData.set("storefrontLogoMediaIdentifier", "l".repeat(43));

    omitUnchangedExtendedFields(formData, prefill);

    expect(formData.has("storefrontThemeId")).toBe(false);
    expect(formData.has("storefrontLayout")).toBe(false);
    expect(formData.has("storefrontStandalonePaymentsEnabled")).toBe(false);
    expect(formData.has("storefrontDefaultCurrencyCode")).toBe(false);
    expect(formData.get("storefrontSlug")).toBe("my-store");
    expect(formData.get("storefrontLogoMediaIdentifier")).toBe("l".repeat(43));
  });

  it("keeps an unchanged since-deactivated currency out of the payload but submits a changed one", () => {
    const unchanged = new FormData();
    unchanged.set("storefrontDefaultCurrencyCode", "BRL");
    omitUnchangedExtendedFields(unchanged, prefill);
    expect(unchanged.has("storefrontDefaultCurrencyCode")).toBe(false);

    const changed = new FormData();
    changed.set("storefrontDefaultCurrencyCode", "USD");
    omitUnchangedExtendedFields(changed, prefill);
    expect(changed.get("storefrontDefaultCurrencyCode")).toBe("USD");

    const cleared = new FormData();
    cleared.set("storefrontDefaultCurrencyCode", "");
    omitUnchangedExtendedFields(cleared, prefill);
    expect(cleared.get("storefrontDefaultCurrencyCode")).toBe("");
  });

  it("keeps the emptied logo field so an explicit empty clears the stored logo", () => {
    const formData = new FormData();
    formData.set("storefrontLogoMediaIdentifier", "");
    omitUnchangedExtendedFields(formData, prefill);
    expect(formData.has("storefrontLogoMediaIdentifier")).toBe(true);
    expect(formData.get("storefrontLogoMediaIdentifier")).toBe("");
  });
});

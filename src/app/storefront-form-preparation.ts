// Dirty-field omission for the storefront workspace payload: the server treats
// an absent extended field as unchanged, so the client deletes every extended
// field whose value still equals its prefilled one before the payload is
// formed. An unchanged (possibly since-deactivated) currency or an untouched
// theme therefore never re-validates on save, while any real change submits.
export type StorefrontExtendedPrefill = Readonly<{
  themeId: string;
  layout: string;
  standalonePaymentsEnabled: "true" | "false";
  defaultCurrencyCode: string;
}>;

const OMITTED_WHEN_UNCHANGED = [
  ["storefrontThemeId", "themeId"],
  ["storefrontLayout", "layout"],
  ["storefrontStandalonePaymentsEnabled", "standalonePaymentsEnabled"],
  ["storefrontDefaultCurrencyCode", "defaultCurrencyCode"],
] as const;

export function omitUnchangedExtendedFields(formData: FormData, prefill: StorefrontExtendedPrefill): void {
  for (const [field, key] of OMITTED_WHEN_UNCHANGED) {
    if (formData.get(field) === prefill[key]) formData.delete(field);
  }
  // storefrontLogoMediaIdentifier always submits: an unchanged identifier is a
  // server-side no-op and an explicit empty value clears the stored logo.
}

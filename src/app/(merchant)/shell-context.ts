import { redirect } from "next/navigation";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import { getStorefrontSettingsService } from "@/auth/storefront-settings";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";

import { requireOwnerFromCookie } from "../owner-guard";

export async function requireMerchantShellContext() {
  try {
    const principal = await requireOwnerFromCookie();
    const locale = await getLocalePreferenceService().resolve(principal.id);
    const dictionary = getDictionary(locale);
    const storefrontSettings = await getStorefrontSettingsService().getForOwner(principal);
    const storefrontLink = storefrontSettings.storefrontEnabled && storefrontSettings.storefrontSlug !== null
      ? { href: `/store/${storefrontSettings.storefrontSlug}`, label: dictionary.shellStorefront }
      : undefined;
    return { dictionary, locale, principal, storefrontLink };
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/admin");
    throw error;
  }
}

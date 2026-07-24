import { redirect } from "next/navigation";

import { ForbiddenError, UnauthenticatedError } from "@/auth/authorization";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";

import { requireOwnerFromCookie } from "../owner-guard";

export async function requireMerchantShellContext() {
  try {
    const principal = await requireOwnerFromCookie();
    const locale = await getLocalePreferenceService().resolve(principal.id);
    return { dictionary: getDictionary(locale), locale, principal };
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/admin");
    throw error;
  }
}

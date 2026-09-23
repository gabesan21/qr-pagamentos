import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getCheckoutPolicyService } from "@/auth/checkout-policy";
import { getStorefrontSettingsService } from "@/auth/storefront-settings";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { getOwnerOnboardingService } from "@/integrations/nautt/owner-onboarding";
import { MEDIA_IDENTIFIER_PATTERN } from "@/media/types";

import { SettingsSurface } from "./settings-surface";
import { requireMerchantShellContext } from "../shell-context";

type SettingsNotices = Readonly<{
  "checkout-policy"?: string;
  language?: string;
  logo?: string;
  nautt?: string;
  storefront?: string;
  "storefront-logo"?: string;
}>;

export default async function MerchantSettingsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<SettingsNotices> }>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const [nauttStatus, checkoutPolicy, storefrontSettings, currencyChoices, notices] = await Promise.all([
    getOwnerOnboardingService().readStatus(principal),
    getCheckoutPolicyService().getForOwner(principal),
    getStorefrontSettingsService().getForOwner(principal),
    getSupportedExchangeCurrencyService().listActiveChoices(principal),
    searchParams,
  ]);
  // The staged logo identifier is the public-safe media handle; anything else
  // in the query is dropped instead of reaching the media read route.
  const stagedLogo =
    notices["storefront-logo"] === "staged" && typeof notices.logo === "string" && MEDIA_IDENTIFIER_PATTERN.test(notices.logo)
      ? notices.logo
      : null;

  return (
    <>
      <WorkspaceHeading
        description={dictionary.settingsPageDescription}
        eyebrow={dictionary.shellMerchantEyebrow}
        title={dictionary.shellSettings}
      />
      <SettingsSurface
        checkoutPolicy={checkoutPolicy.checkoutDataPolicy}
        currencyChoices={currencyChoices}
        dictionary={dictionary}
        locale={locale}
        nauttStatus={nauttStatus}
        notices={notices}
        storefrontSettings={storefrontSettings}
        stagedLogoMediaIdentifier={stagedLogo}
      />
    </>
  );
}

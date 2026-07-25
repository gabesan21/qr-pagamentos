import Link from "next/link";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import type { Principal } from "@/auth/authorization";
import { getStorefrontSettingsService } from "@/auth/storefront-settings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getMerchantAnalyticsService, type MerchantAnalyticsView } from "@/orders/merchant-analytics";

import { DashboardPeriodNavigation, MerchantDashboard } from "./dashboard";
import { requireMerchantShellContext } from "./shell-context";

// The period controls emit only the closed set; an absent or hand-edited value
// renders the pinned default, exactly like the service's invalid-period kind.
const DEFAULT_PERIOD = "7d";

async function readDashboardView(principal: Principal, period: unknown): Promise<MerchantAnalyticsView> {
  const service = getMerchantAnalyticsService();
  const result = await service.getForOwner(principal, period);
  if (result.kind === "ready") return result.view;
  const fallback = await service.getForOwner(principal, DEFAULT_PERIOD);
  if (fallback.kind === "ready") return fallback.view;
  throw new Error("Merchant analytics rejected the pinned default period");
}

export default async function MerchantDashboardPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<{
    "checkout-policy"?: string;
    "payment-links"?: string;
    language?: string;
    period?: string;
    storefront?: string;
  }>;
}> = {}) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const notices = await searchParams;
  const [view, storefrontSettings] = await Promise.all([
    readDashboardView(principal, notices.period),
    getStorefrontSettingsService().getForOwner(principal),
  ]);
  const ownerNotice = notices["payment-links"] ?? notices["checkout-policy"] ?? notices.storefront;
  const failed = ownerNotice === "failed" || ownerNotice === "conflict";
  const viewStore = storefrontSettings.storefrontEnabled && storefrontSettings.storefrontSlug !== null
    ? `/store/${storefrontSettings.storefrontSlug}`
    : null;

  return (
    <>
      <div className="merchant-dashboard__header">
        <WorkspaceHeading
          description={dictionary.shellMerchantDashboardDescription}
          eyebrow={dictionary.shellMerchantEyebrow}
          title={dictionary.shellMerchantDashboardTitle}
        />
        {viewStore ? (
          <Button asChild><Link href={viewStore}>{dictionary.merchantDashboardViewStore}</Link></Button>
        ) : null}
      </div>
      {ownerNotice ? (
        <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "success"}>
          <AlertTitle>{failed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
          <AlertDescription>{failed ? dictionary.ownerSettingsFailed : dictionary.ownerSettingsUpdated}</AlertDescription>
        </Alert>
      ) : null}
      {notices.language === "saved" ? <Alert role="status" variant="success"><AlertTitle>{dictionary.languageHeading}</AlertTitle><AlertDescription>{dictionary.languageSaved}</AlertDescription></Alert> : null}
      {notices.language === "error" ? <Alert variant="destructive"><AlertTitle>{dictionary.languageHeading}</AlertTitle><AlertDescription>{dictionary.languageError}</AlertDescription></Alert> : null}
      <DashboardPeriodNavigation current={view.period.id} dictionary={dictionary} />
      <MerchantDashboard dictionary={dictionary} locale={locale} view={view} />
    </>
  );
}

import Link from "next/link";

import { ExternalLink } from "lucide-react";

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
    "payment-links"?: string;
    language?: string;
    period?: string;
  }>;
}> = {}) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const notices = await searchParams;
  const [view, storefrontSettings] = await Promise.all([
    readDashboardView(principal, notices.period),
    getStorefrontSettingsService().getForOwner(principal),
  ]);
  // storefront and checkout-policy saves now return to /settings, never here.
  const ownerNotice = notices["payment-links"];
  const failed = ownerNotice === "failed" || ownerNotice === "conflict";
  const viewStore = storefrontSettings.storefrontEnabled && storefrontSettings.storefrontSlug !== null
    ? `/store/${storefrontSettings.storefrontSlug}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{dictionary.shellMerchantDashboardTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dictionary.merchantDashboardGreeting.replace("{username}", principal.username)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {viewStore ? (
            <Button asChild variant="secondary">
              <Link href={viewStore}>
                <ExternalLink className="size-4" aria-hidden />
                {dictionary.merchantDashboardViewStore}
              </Link>
            </Button>
          ) : null}
          <DashboardPeriodNavigation current={view.period.id} dictionary={dictionary} />
        </div>
      </div>
      {ownerNotice ? (
        <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "success"}>
          <AlertTitle>{failed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
          <AlertDescription>{failed ? dictionary.ownerSettingsFailed : dictionary.ownerSettingsUpdated}</AlertDescription>
        </Alert>
      ) : null}
      {notices.language === "saved" ? (
        <noscript>
          <Alert role="status" variant="success">
            <AlertTitle>{dictionary.languageHeading}</AlertTitle>
            <AlertDescription>{dictionary.languageSaved}</AlertDescription>
          </Alert>
        </noscript>
      ) : null}
      {notices.language === "error" ? (
        <noscript>
          <Alert variant="destructive">
            <AlertTitle>{dictionary.languageHeading}</AlertTitle>
            <AlertDescription>{dictionary.languageError}</AlertDescription>
          </Alert>
        </noscript>
      ) : null}
      <MerchantDashboard dictionary={dictionary} locale={locale} view={view} />
    </div>
  );
}

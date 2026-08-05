import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, StatGridSkeleton } from "@/components/ui/skeletons";
import { en } from "@/i18n/dictionaries/en";

export default function MerchantDashboardLoading() {
  return (
    <div aria-busy="true" className="space-y-6" role="status">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-40 max-w-full" />
        </div>
        <Skeleton className="h-11 w-64 max-w-full" />
      </div>
      <StatGridSkeleton count={4} label={en.merchantDashboardCheckoutAttempts} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <CardSkeleton label={en.merchantDashboardSalesHeading} />
        </div>
        <div className="lg:col-span-5">
          <CardSkeleton label={en.merchantDashboardFunnelHeading} />
        </div>
      </div>
      <StatGridSkeleton count={2} label={en.merchantDashboardLinksHeading} />
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <CardSkeleton label={en.merchantDashboardBestSellersHeading} />
        </div>
        <div className="lg:col-span-5">
          <CardSkeleton label={en.merchantDashboardRecentHeading} />
        </div>
      </div>
    </div>
  );
}

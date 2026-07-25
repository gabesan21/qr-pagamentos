import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MerchantDashboardLoading() {
  return (
    <div aria-busy="true" className="merchant-dashboard" role="status">
      <div className="merchant-dashboard__header">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-11 w-28" />
      </div>
      <Skeleton className="h-11 w-64" />
      {[0, 1, 2].map((card) => (
        <Card key={card}>
          <CardHeader><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardHeader>
          <CardContent><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></CardContent>
        </Card>
      ))}
    </div>
  );
}

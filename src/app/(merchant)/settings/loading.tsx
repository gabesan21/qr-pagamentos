import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div aria-busy="true" className="storefront-workspace" role="status">
      {[0, 1, 2, 3].map((card) => (
        <Card key={card}>
          <CardHeader><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardHeader>
          <CardContent><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></CardContent>
        </Card>
      ))}
    </div>
  );
}

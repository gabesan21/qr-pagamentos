import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicStorefrontLoading() {
  return (
    <main aria-busy="true" className="storefront-shell">
      <Card className="storefront-card">
        <CardHeader><Skeleton className="storefront-skeleton storefront-skeleton--title" /></CardHeader>
        <CardContent><Skeleton className="storefront-skeleton storefront-skeleton--body" /></CardContent>
      </Card>
    </main>
  );
}

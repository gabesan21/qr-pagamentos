import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function StandalonePaymentLoading() {
  return (
    <main aria-busy="true" className="storefront-shell">
      <Card className="storefront-card">
        <CardHeader><Skeleton className="storefront-skeleton storefront-skeleton--title" /></CardHeader>
        <CardContent><Skeleton className="storefront-skeleton storefront-skeleton--body" /></CardContent>
        <CardFooter><Skeleton className="storefront-skeleton storefront-skeleton--control" /></CardFooter>
      </Card>
      <Card className="storefront-card">
        <CardHeader><Skeleton className="storefront-skeleton storefront-skeleton--title" /></CardHeader>
        <CardContent><Skeleton className="storefront-skeleton storefront-skeleton--lines" /></CardContent>
      </Card>
    </main>
  );
}

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PublicCheckoutLoading() {
  return (
    <main aria-busy="true" className="checkout-shell">
      <Card className="checkout-card">
        <CardHeader><Skeleton className="checkout-skeleton checkout-skeleton--title" /></CardHeader>
        <CardContent><Skeleton className="checkout-skeleton checkout-skeleton--body" /></CardContent>
      </Card>
    </main>
  );
}

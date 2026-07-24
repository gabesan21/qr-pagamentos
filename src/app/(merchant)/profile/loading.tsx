import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <div aria-busy="true" className="profile-workspace__cards" role="status">
      {[0, 1].map((card) => (
        <Card key={card}>
          <CardHeader><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardHeader>
          <CardContent><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></CardContent>
        </Card>
      ))}
    </div>
  );
}

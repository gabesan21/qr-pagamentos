import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";

const MAX_SKELETON_ITEMS = 12;

function boundedCount(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_SKELETON_ITEMS, Math.max(1, Math.floor(value)));
}

function LoadingRegion({ children, label }: Readonly<{ children: ReactNode; label: string }>) {
  return (
    <div aria-busy="true" aria-label={label} role="status">
      {children}
    </div>
  );
}

export function CardSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <LoadingRegion label={label}>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-20" />
        </CardContent>
      </Card>
    </LoadingRegion>
  );
}

export function StatGridSkeleton({ count = 4, label }: Readonly<{ count?: number; label: string }>) {
  return (
    <LoadingRegion label={label}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: boundedCount(count, 4) }, (_, index) => (
          <Card key={index}>
            <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function TableSkeleton({ columns = 5, label, rows = 6 }: Readonly<{ columns?: number; label: string; rows?: number }>) {
  const safeColumns = boundedCount(columns, 5);
  const safeRows = boundedCount(rows, 6);
  return (
    <LoadingRegion label={label}>
      <div className="flex flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-border">
        {Array.from({ length: safeRows }, (_, row) => (
          <div className="flex gap-3" key={row}>
            {Array.from({ length: safeColumns }, (_, column) => (
              <Skeleton className="h-4 min-w-0 flex-1" key={column} />
            ))}
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function DetailSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <LoadingRegion label={label}>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Card>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-3 h-4 w-1/2" />
          </CardContent>
        </Card>
      </div>
    </LoadingRegion>
  );
}

export function CheckoutSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <LoadingRegion label={label}>
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3"><Skeleton className="size-10 rounded-full" /><Skeleton className="h-4 w-32" /></div>
          <Skeleton className="mx-auto aspect-square w-full max-w-66" />
          <Skeleton className="mx-auto h-4 w-3/4" />
          <Skeleton className="h-11 w-full" />
        </CardContent>
      </Card>
    </LoadingRegion>
  );
}

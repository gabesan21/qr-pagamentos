import { cn } from "@/lib/utils";

function Bar({ className }: { className?: string }) {
  return <div className={cn("skeleton-shimmer rounded-md", className)} aria-hidden />;
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4" role="status" aria-busy>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: columns }).map((_, c) => <Bar key={`${r}-${c}`} className={cn("h-4", c === 0 ? "w-3/4" : "w-1/2")} />),
        )}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-card border border-border bg-surface p-5" role="status" aria-busy>
      <Bar className="h-3 w-24" />
      <Bar className="mt-3 h-6 w-32" />
      <Bar className="mt-3 h-3 w-20" />
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-busy>
      <Bar className="h-7 w-56" />
      <div className="rounded-card border border-border bg-surface p-6">
        <Bar className="h-4 w-full" />
        <Bar className="mt-3 h-4 w-5/6" />
        <Bar className="mt-3 h-4 w-2/3" />
        <Bar className="mt-6 h-4 w-1/2" />
      </div>
    </div>
  );
}

export function CheckoutSkeleton() {
  return (
    <div className="mx-auto max-w-checkout rounded-card border border-border bg-surface p-6" role="status" aria-busy>
      <div className="flex items-center gap-3">
        <Bar className="size-10 rounded-full" />
        <Bar className="h-4 w-32" />
      </div>
      <Bar className="mx-auto mt-6 size-[264px] rounded-card" />
      <Bar className="mt-4 h-4 w-3/4 mx-auto" />
      <Bar className="mt-4 h-10 w-full" />
    </div>
  );
}

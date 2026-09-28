import { Skeleton } from "@/components/ui/skeleton";

// Route fallbacks cannot resolve the user's locale or directory registration.
// This neutral geometry mirrors the compact toolbar and a bounded result window
// without inventing labels or exposing a transient empty state.
export function DirectoryRouteSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <section aria-busy="true" aria-label={label} className="flex min-w-0 flex-col gap-6" role="status">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(var(--directory-filter-column-min-width),0.4fr)]">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-(--control-default-height) w-full" />
        <Skeleton className="h-(--control-default-height) w-full" />
      </div>
      <Skeleton className="h-17 w-full" />
      <div className="hidden flex-col gap-3 md:flex">
        {["first", "second", "third"].map((row) => <Skeleton className="h-13 w-full" key={row} />)}
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {["first", "second"].map((row) => <Skeleton className="h-28 w-full" key={row} />)}
      </div>
    </section>
  );
}

import { TableSkeleton } from "@/components/ui/skeletons";

export default function CatalogLoading() {
  return (
    <div aria-busy="true" className="space-y-6" role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-4 w-72 rounded bg-muted" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-11 w-36 rounded bg-muted" />
          <div className="h-11 w-36 rounded bg-muted" />
        </div>
      </div>
      <TableSkeleton columns={6} label="Loading products" rows={6} />
    </div>
  );
}

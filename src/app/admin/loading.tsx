import { Skeleton } from "@/components/ui/skeleton";
import { en } from "@/i18n/dictionaries/en";

export default function AdminLoading() {
  return (
    <div aria-busy="true" className="space-y-4" role="status">
      <Skeleton className="h-4 w-32 max-w-full" />
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-48 max-w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <span className="sr-only">{en.adminDashboardUsersHeading}</span>
    </div>
  );
}

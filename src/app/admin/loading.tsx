import { Skeleton } from "@/components/ui/skeleton";
import { en } from "@/i18n/dictionaries/en";

import { AdminDashboardSkeleton } from "./dashboard";

export default function AdminLoading() {
  return (
    <div aria-busy="true" className="admin-dashboard" role="status">
      <div className="admin-dashboard__header">
        <div className="workspace-heading">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-11 w-64" />
      </div>
      <AdminDashboardSkeleton dictionary={en} />
    </div>
  );
}

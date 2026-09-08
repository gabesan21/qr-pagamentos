import { en } from "@/i18n/dictionaries/en";

import { AdminDashboardSkeleton } from "./dashboard";

// Hard-coded to the English dictionary so the fallback never flashes the
// wrong persisted locale while the admin layout is resolving; the per-card
// skeleton geometry matches the final 3 / 5-4-3 / 4 / 2 dashboard rows.
export default function AdminLoading() {
  return <AdminDashboardSkeleton dictionary={en} />;
}

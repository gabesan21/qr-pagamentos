import { Navigate, Outlet } from "react-router";
import { ShieldAlert } from "lucide-react";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import type { Role } from "@/mock/types";
import { Button } from "@/components/ui/button";

/**
 * Role guard: unauthenticated → /login; wrong role → safe "unavailable" notice,
 * never the protected content or its actions (design.md §6.1).
 */
export function RoleGuard({ allow }: { allow: Role }) {
  const { t } = useI18n();
  const { user, isAuthenticated, demoUsers, switchUser } = useSession();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role !== allow) {
    const other = demoUsers.find((u) => u.role === allow);
    return (
      <div className="mx-auto mt-16 max-w-md rounded-card border border-border bg-surface p-8 text-center shadow-card">
        <ShieldAlert className="mx-auto size-8 text-text-3" aria-hidden />
        <h2 className="mt-3 font-display text-lg font-semibold text-text">{t("common.unavailable")}</h2>
        <p className="mt-1 text-sm text-text-2">{t("common.unavailableBody")}</p>
        {other && (
          <Button variant="secondary" className="mt-4" onClick={() => switchUser(other.id)}>
            {other.username} ({t(allow === "ADMIN" ? "role.ADMIN" : "role.USER")})
          </Button>
        )}
      </div>
    );
  }
  return <Outlet />;
}

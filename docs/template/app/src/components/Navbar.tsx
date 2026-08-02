import { NavLink } from "react-router";
import { LayoutDashboard, Package, ReceiptText, Settings, Link2, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { useSession } from "@/mock/session";
import { Monogram } from "@/components/ui/Monogram";
import { Logo } from "./Logo";

export interface NavItem {
  to: string;
  icon: React.ReactNode;
  labelKey: "nav.dashboard" | "nav.orders" | "nav.paymentLinks" | "nav.users" | "nav.settings" | "nav.catalog";
  end?: boolean;
}

const adminNav: NavItem[] = [
  { to: "/admin", icon: <LayoutDashboard className="size-4" />, labelKey: "nav.dashboard", end: true },
  { to: "/admin/orders", icon: <ReceiptText className="size-4" />, labelKey: "nav.orders" },
  { to: "/admin/payment-links", icon: <Link2 className="size-4" />, labelKey: "nav.paymentLinks" },
  { to: "/admin/accounts", icon: <Users className="size-4" />, labelKey: "nav.users" },
  { to: "/admin/settings", icon: <Settings className="size-4" />, labelKey: "nav.settings" },
];

const merchantNav: NavItem[] = [
  { to: "/", icon: <LayoutDashboard className="size-4" />, labelKey: "nav.dashboard", end: true },
  { to: "/orders", icon: <ReceiptText className="size-4" />, labelKey: "nav.orders" },
  { to: "/links", icon: <Link2 className="size-4" />, labelKey: "nav.paymentLinks" },
  { to: "/catalog", icon: <Package className="size-4" />, labelKey: "nav.catalog" },
  { to: "/settings", icon: <Settings className="size-4" />, labelKey: "nav.settings" },
];

export function navForRole(role: "ADMIN" | "USER"): NavItem[] {
  return role === "ADMIN" ? adminNav : merchantNav;
}

/** Sidebar nav (design.md §6.1): wordmark + caption, role-aware items, active accent bar, user chip. */
export function Navbar({
  collapsed = false,
  onClose,
  className,
}: {
  collapsed?: boolean;
  onClose?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const { user } = useSession();
  if (!user) return null;
  const items = navForRole(user.role);

  return (
    <nav
      className={cn(
        "flex h-full flex-col border-r border-border bg-surface",
        collapsed ? "w-16" : "w-[248px]",
        className,
      )}
      aria-label={t("nav.menu")}
    >
      <div className={cn("flex h-14 items-center gap-2 border-b border-border px-4", collapsed && "justify-center px-2")}>
        <Logo glyphOnly={collapsed} className="shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-bold text-text">{t("app.name")}</div>
            <div className="truncate text-[11px] text-text-3">{t("app.caption")}</div>
          </div>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t("nav.close")} className="ml-auto rounded p-1 text-text-3 hover:bg-surface-2 lg:hidden">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              title={t(item.labelKey)}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  isActive
                    ? "bg-accent-soft text-text before:absolute before:left-0 before:top-1 before:bottom-1 before:w-[3px] before:rounded-full before:bg-accent"
                    : "text-text-2 hover:bg-surface-2 hover:text-text",
                )
              }
              onClick={onClose}
            >
              {item.icon}
              {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className={cn("flex items-center gap-2.5 border-t border-border p-3", collapsed && "justify-center")}>
        <Monogram name={user.username} size={32} />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text">{user.username}</div>
            <span className="inline-block rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-text-2">
              {t(user.role === "ADMIN" ? "role.ADMIN" : "role.USER")}
            </span>
          </div>
        )}
      </div>
    </nav>
  );
}

import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ExternalLink, LogOut, Menu, RefreshCcw, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import type { DictKey } from "@/i18n";
import { useSession } from "@/mock/session";
import { Navbar } from "./Navbar";
import { LanguageSwitcher } from "./Footer";
import { Monogram } from "@/components/ui/Monogram";

const titleByPath: Array<[RegExp, DictKey]> = [
  [/^\/admin\/orders/, "nav.orders"],
  [/^\/admin\/payment-links/, "nav.paymentLinks"],
  [/^\/admin\/accounts/, "nav.users"],
  [/^\/admin\/settings/, "nav.settings"],
  [/^\/admin/, "nav.dashboard"],
  [/^\/orders/, "nav.orders"],
  [/^\/links/, "nav.paymentLinks"],
  [/^\/catalog/, "nav.catalog"],
  [/^\/settings/, "nav.settings"],
  [/^\/profile/, "nav.profile"],
  [/^\/$/, "nav.dashboard"],
];

/** Authenticated shell (design.md §6.1): sidebar + sticky 56px topbar, content via <Outlet/>. */
export default function Layout() {
  const { t } = useI18n();
  const { user, signOut, switchUser, demoUsers } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  const titleKey = titleByPath.find(([re]) => re.test(location.pathname))?.[1] ?? "nav.dashboard";

  const onSignOut = () => {
    signOut();
    navigate("/login");
  };

  return (
    <div className="flex min-h-[100dvh] bg-bg">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Navbar className="sticky top-0 h-[100dvh]" />
      </div>

      {/* Mobile overlay drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
            <motion.div
              initial={{ x: -248 }}
              animate={{ x: 0 }}
              exit={{ x: -248 }}
              transition={{ type: "spring", duration: 0.22 }}
              className="absolute inset-y-0 left-0"
            >
              <Navbar onClose={() => setDrawerOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky topbar — normal document flow, no page offset needed */}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 lg:px-6">
          <button
            type="button"
            className="rounded-md p-2 text-text-2 hover:bg-surface-2 lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("nav.menu")}
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <h1 className="font-display text-[15px] font-semibold text-text">{t(titleKey)}</h1>

          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher compact />
            {user.role === "USER" && user.storefront.enabled && user.storefront.slug && (
              <Link
                to={`/pay/${user.storefront.slug}`}
                className="hidden items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-2 hover:bg-surface-2 sm:inline-flex"
              >
                <ExternalLink className="size-3.5" aria-hidden />
                {t("nav.storefront")}
              </Link>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Monogram name={user.username} size={28} />
                <span className="hidden text-sm font-medium text-text sm:block">{user.username}</span>
                <span className="hidden rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-text-2 sm:inline-block">
                  {t(user.role === "ADMIN" ? "role.ADMIN" : "role.USER")}
                </span>
                <ChevronDown className="size-3.5 text-text-3" aria-hidden />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div role="menu" className="absolute right-0 z-20 mt-1 w-56 rounded-card border border-border bg-surface p-1.5 shadow-modal">
                    {user.role === "USER" && (
                      <Link
                        to="/profile"
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text"
                      >
                        <UserRound className="size-4" aria-hidden />
                        {t("nav.profile")}
                      </Link>
                    )}
                    {/* Demo role/session switcher */}
                    <div className="mt-1 border-t border-border pt-1">
                      {demoUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            switchUser(u.id);
                            setMenuOpen(false);
                            navigate(u.role === "ADMIN" ? "/admin" : "/");
                          }}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-2",
                            u.id === user.id ? "text-accent" : "text-text-2",
                          )}
                        >
                          <RefreshCcw className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{u.username}</span>
                          <span className="ml-auto text-[10px] font-semibold text-text-3">
                            {t(u.role === "ADMIN" ? "role.ADMIN" : "role.USER")}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={onSignOut}
                      className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border px-2.5 py-2 pt-2.5 text-sm text-danger hover:bg-danger-soft"
                    >
                      <LogOut className="size-4" aria-hidden />
                      {t("nav.signOut")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-app flex-1 p-4 lg:p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}

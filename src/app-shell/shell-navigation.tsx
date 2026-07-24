"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ShellNavigationItem } from "./shell-types";

function isActiveRoute(pathname: string, href: string) {
  if (href === "/" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationLinks({
  items,
  pathname,
  onNavigate,
}: Readonly<{
  items: readonly ShellNavigationItem[];
  pathname: string;
  onNavigate?: () => void;
}>) {
  return (
    <ol className="app-shell__navigation-list">
      {items.map((item, index) => {
        const active = isActiveRoute(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              aria-current={active ? "page" : undefined}
              className="app-shell__navigation-link"
              href={item.href}
              onClick={onNavigate}
            >
              <span aria-hidden="true" className="app-shell__navigation-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

type NavigationProps = Readonly<{
  accountLink?: Readonly<{ href: string; label: string }>;
  closeLabel: string;
  items: readonly ShellNavigationItem[];
  label: string;
  openLabel: string;
  signOutLabel?: string;
}>;

export function DesktopShellNavigation({
  items,
  label,
}: NavigationProps) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="app-shell__desktop-navigation">
      <NavigationLinks items={items} pathname={pathname} />
    </nav>
  );
}

export function MobileShellNavigation({
  accountLink,
  closeLabel,
  items,
  label,
  openLabel,
  signOutLabel,
}: NavigationProps) {
  const pathname = usePathname();
  const mobileNavigationId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
      <div className="app-shell__mobile-navigation">
        <Button
          aria-controls={mobileNavigationId}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? closeLabel : openLabel}
          className="app-shell__mobile-trigger"
          onClick={() => setMobileOpen((open) => !open)}
          type="button"
          variant="outline"
        >
          {mobileOpen ? <XIcon aria-hidden="true" data-icon="inline-start" /> : <MenuIcon aria-hidden="true" data-icon="inline-start" />}
          <span className="app-shell__mobile-trigger-label">{mobileOpen ? closeLabel : openLabel}</span>
        </Button>
        {mobileOpen ? (
          <nav aria-label={label} className="app-shell__mobile-panel" id={mobileNavigationId}>
            <NavigationLinks items={items} onNavigate={() => setMobileOpen(false)} pathname={pathname} />
            {accountLink ? (
              <Link className="app-shell__profile-link" href={accountLink.href} onClick={() => setMobileOpen(false)}>
                {accountLink.label}
              </Link>
            ) : null}
            {signOutLabel ? (
              <form action="/logout" method="post">
                <Button className="app-shell__mobile-sign-out" type="submit" variant="outline">
                  {signOutLabel}
                </Button>
              </form>
            ) : null}
          </nav>
        ) : null}
      </div>
  );
}

export { isActiveRoute };

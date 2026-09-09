"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import { ChevronDownIcon, ExternalLinkIcon, LogOutIcon, MenuIcon, UserIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Monogram } from "@/components/ui/monogram";

import { ShellThemePicker } from "./shell-theme-picker";
import type { ShellLabels, ShellNavigationItem, ShellThemeOption, ShellTitleRoute } from "./shell-types";

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
      {items.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              aria-current={active ? "page" : undefined}
              className="app-shell__navigation-link"
              href={item.href}
              onClick={onNavigate}
            >
              <span aria-hidden="true" className="app-shell__navigation-icon">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function LanguageSwitcherForm({
  labels,
  locale,
}: Readonly<{
  labels: Pick<ShellLabels, "language" | "locale">;
  locale: string;
}>) {
  return (
    <form action="/language-preference" className="app-shell__language-form" method="post">
      <label className="app-shell__language-label" htmlFor="shell-locale">
        {labels.language}
      </label>
      <select
        className="app-shell__language-select"
        defaultValue={locale}
        id="shell-locale"
        name="locale"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="pt-BR">Português (Brasil)</option>
        <option value="en">English</option>
      </select>
    </form>
  );
}

function AccountMenu({
  labels,
  profileLink,
  roleLabel,
  themeOptions,
  username,
}: Readonly<{
  labels: Pick<ShellLabels, "accountMenu" | "profile" | "signOut" | "themeMenu">;
  profileLink?: Readonly<{ href: string; label: string }>;
  roleLabel: string;
  themeOptions: readonly ShellThemeOption[];
  username: string;
}>) {
  const menuId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell__account-menu">
      <Button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        className="app-shell__account-trigger"
        onClick={() => setOpen((value) => !value)}
        type="button"
        variant="ghost"
      >
        <Monogram accessibleName={labels.accountMenu} name={username} size="sm" />
        <span className="app-shell__account-names">
          <span className="app-shell__account-username">{username}</span>
          <span className="app-shell__account-role">{roleLabel}</span>
        </span>
        <ChevronDownIcon aria-hidden="true" className="app-shell__account-chevron" />
      </Button>
      {open ? (
        <div className="app-shell__account-panel" id={menuId} role="menu">
          {profileLink ? (
            <Link className="app-shell__account-panel-item" href={profileLink.href} role="menuitem">
              <UserIcon aria-hidden="true" />
              <span>{profileLink.label}</span>
            </Link>
          ) : null}
          <ShellThemePicker groupLabel={labels.themeMenu} themeOptions={themeOptions} />
          <form action="/logout" className="app-shell__account-panel-signout" method="post" role="none">
            <button className="app-shell__account-panel-item" role="menuitem" type="submit">
              <LogOutIcon aria-hidden="true" />
              <span>{labels.signOut}</span>
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

type NavigationProps = Readonly<{
  accountLink?: Readonly<{ href: string; label: string }>;
  closeLabel: string;
  items: readonly ShellNavigationItem[];
  label: string;
  openLabel: string;
  roleLabel: string;
  signOutLabel: string;
  username: string;
}>;

export function DesktopShellNavigation({
  items,
  label,
}: Readonly<Pick<NavigationProps, "items" | "label">>) {
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
  roleLabel,
  signOutLabel,
  username,
}: NavigationProps) {
  const pathname = usePathname();
  const mobileNavigationId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell__mobile-navigation">
      <Button
        aria-controls={mobileNavigationId}
        aria-expanded={mobileOpen}
        aria-label={openLabel}
        className="app-shell__mobile-trigger"
        onClick={() => setMobileOpen((open) => !open)}
        type="button"
        variant="ghost"
      >
        {mobileOpen ? <XIcon aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
        <span className="app-shell__mobile-trigger-label">{openLabel}</span>
      </Button>
      {mobileOpen ? (
        <div className="app-shell__mobile-overlay" onClick={() => setMobileOpen(false)} />
      ) : null}
      {mobileOpen ? (
        <nav aria-label={label} className="app-shell__mobile-panel" id={mobileNavigationId}>
          <div className="app-shell__mobile-panel-header">
            <Button
              aria-controls={mobileNavigationId}
              aria-expanded={mobileOpen}
              aria-label={closeLabel}
              className="app-shell__mobile-close"
              onClick={() => setMobileOpen(false)}
              type="button"
              variant="ghost"
            >
              <XIcon aria-hidden="true" />
              <span>{closeLabel}</span>
            </Button>
          </div>
          <NavigationLinks items={items} onNavigate={() => setMobileOpen(false)} pathname={pathname} />
          <div className="app-shell__mobile-panel-footer">
            <div className="app-shell__mobile-principal">
              <Monogram name={username} size="default" />
              <div className="app-shell__mobile-principal-text">
                <span className="app-shell__username">{username}</span>
                <span>{roleLabel}</span>
              </div>
            </div>
            {accountLink ? (
              <Link
                className="app-shell__profile-link"
                href={accountLink.href}
                onClick={() => setMobileOpen(false)}
              >
                <UserIcon aria-hidden="true" />
                <span>{accountLink.label}</span>
              </Link>
            ) : null}
            <form action="/logout" method="post">
              <Button className="app-shell__mobile-sign-out" type="submit" variant="outline">
                {signOutLabel}
              </Button>
            </form>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

export function TopBarShellControls({
  accountLink,
  identity,
  labels,
  locale,
  mobileNavigation,
  roleLabel,
  storefrontLink,
  themeOptions = [],
  titleFallback,
  titleRoutes = [],
  username,
}: Readonly<{
  accountLink?: Readonly<{ href: string; label: string }>;
  identity: ReactNode;
  labels: ShellLabels;
  locale: string;
  mobileNavigation: Readonly<Pick<NavigationProps, "items"> & { label: string }>;
  roleLabel: string;
  storefrontLink?: Readonly<{ href: string; label: string }>;
  themeOptions?: readonly ShellThemeOption[];
  titleFallback?: string;
  titleRoutes?: readonly ShellTitleRoute[];
  username: string;
}>) {
  const pathname = usePathname();
  const pageTitle = titleRoutes.find((route) => isActiveRoute(pathname, route.href))?.label ?? titleFallback ?? "";

  return (
    <header className="app-shell__top-bar">
      <div className="app-shell__top-bar-start">
        <div className="app-shell__top-bar-identity">{identity}</div>
        <MobileShellNavigation
          accountLink={accountLink}
          closeLabel={labels.closeNavigation}
          items={mobileNavigation.items}
          label={mobileNavigation.label}
          openLabel={labels.openNavigation}
          roleLabel={roleLabel}
          signOutLabel={labels.signOut}
          username={username}
        />
        <span className="app-shell__page-title">{pageTitle}</span>
      </div>
      <div className="app-shell__top-bar-end">
        <LanguageSwitcherForm labels={labels} locale={locale} />
        {storefrontLink ? (
          <Link className="app-shell__storefront-link" href={storefrontLink.href} target="_blank">
            <ExternalLinkIcon aria-hidden="true" />
            <span>{storefrontLink.label}</span>
          </Link>
        ) : null}
        <AccountMenu
          labels={{
            accountMenu: labels.accountMenu,
            profile: labels.profile,
            signOut: labels.signOut,
            themeMenu: labels.themeMenu,
          }}
          profileLink={accountLink}
          roleLabel={roleLabel}
          themeOptions={themeOptions}
          username={username}
        />
      </div>
    </header>
  );
}

export { isActiveRoute };

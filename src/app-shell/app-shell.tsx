import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { DesktopShellNavigation, TopBarShellControls } from "./shell-navigation";
import type { ShellLabels, ShellNavigationItem, ShellThemeOption } from "./shell-types";

export function AppShell({
  children,
  identity,
  labels,
  locale,
  navigation,
  pageTitle,
  profileLink,
  roleLabel,
  storefrontLink,
  themeOptions,
  username,
}: Readonly<{
  children: ReactNode;
  identity: ReactNode;
  labels: ShellLabels;
  locale: string;
  navigation: readonly ShellNavigationItem[];
  pageTitle: string;
  profileLink?: Readonly<{ href: string; label: string }>;
  roleLabel: string;
  storefrontLink?: Readonly<{ href: string; label: string }>;
  themeOptions?: readonly ShellThemeOption[];
  username: string;
}>) {
  return (
    <div className="app-shell">
      <a className="app-shell__skip-link" href="#app-shell-content">
        {labels.skipToContent}
      </a>
      <aside className="app-shell__rail">
        <div className="app-shell__rail-header app-shell__brand-identity">{identity}</div>
        <DesktopShellNavigation items={navigation} label={labels.navigation} />
        <div className="app-shell__rail-footer">
          <div className="app-shell__rail-principal">
            <span className="app-shell__username">{username}</span>
            <span>{roleLabel}</span>
          </div>
          <form action="/logout" className="app-shell__rail-sign-out" method="post">
            <Button className="app-shell__sign-out" type="submit" variant="outline">
              {labels.signOut}
            </Button>
          </form>
        </div>
      </aside>
      <TopBarShellControls
        accountLink={profileLink}
        identity={identity}
        labels={labels}
        locale={locale}
        mobileNavigation={{ items: navigation, label: labels.navigation }}
        pageTitle={pageTitle}
        roleLabel={roleLabel}
        storefrontLink={storefrontLink}
        themeOptions={themeOptions}
        username={username}
      />
      <main className="app-shell__content" id="app-shell-content" tabIndex={-1}>
        <div className="app-shell__content-inner">
          {children}
        </div>
        <footer className="app-shell__footer">
          <span>{labels.copyright}</span>
          <span>{labels.privacy}</span>
          <span className="app-shell__footer-locale">
            {labels.locale}: {locale}
          </span>
        </footer>
      </main>
    </div>
  );
}

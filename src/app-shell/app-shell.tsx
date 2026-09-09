import type { ReactNode } from "react";

import { Monogram } from "@/components/ui/monogram";

import { DesktopShellNavigation, TopBarShellControls } from "./shell-navigation";
import type { ShellLabels, ShellNavigationItem, ShellThemeOption, ShellTitleRoute } from "./shell-types";

export function AppShell({
  children,
  identity,
  labels,
  locale,
  navigation,
  profileLink,
  roleLabel,
  storefrontLink,
  themeOptions,
  titleFallback,
  titleRoutes,
  username,
}: Readonly<{
  children: ReactNode;
  identity: ReactNode;
  labels: ShellLabels;
  locale: string;
  navigation: readonly ShellNavigationItem[];
  profileLink?: Readonly<{ href: string; label: string }>;
  roleLabel: string;
  storefrontLink?: Readonly<{ href: string; label: string }>;
  themeOptions?: readonly ShellThemeOption[];
  // The top-bar title falls back to this label (the role's dashboard entry)
  // when the active route matches none of `titleRoutes`.
  titleFallback: string;
  titleRoutes: readonly ShellTitleRoute[];
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
            <Monogram name={username} size="default" />
            <div className="app-shell__rail-principal-text">
              <span className="app-shell__username">{username}</span>
              <span className="app-shell__rail-role-pill">{roleLabel}</span>
            </div>
          </div>
          <span className="app-shell__rail-caption">{labels.railCaption}</span>
        </div>
      </aside>
      <TopBarShellControls
        accountLink={profileLink}
        identity={identity}
        labels={labels}
        locale={locale}
        mobileNavigation={{ items: navigation, label: labels.navigation }}
        roleLabel={roleLabel}
        storefrontLink={storefrontLink}
        themeOptions={themeOptions}
        titleFallback={titleFallback}
        titleRoutes={titleRoutes}
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

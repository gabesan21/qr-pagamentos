import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { DesktopShellNavigation, MobileShellNavigation } from "./shell-navigation";
import type { ShellLabels, ShellNavigationItem } from "./shell-types";

export function AppShell({
  children,
  identity,
  labels,
  locale,
  navigation,
  roleLabel,
  username,
}: Readonly<{
  children: ReactNode;
  identity: ReactNode;
  labels: ShellLabels;
  locale: string;
  navigation: readonly ShellNavigationItem[];
  roleLabel: string;
  username: string;
}>) {
  return (
    <div className="app-shell">
      <a className="app-shell__skip-link" href="#app-shell-content">
        {labels.skipToContent}
      </a>
      <aside className="app-shell__sidebar">
        <div className="app-shell__identity">{identity}</div>
        <DesktopShellNavigation
          closeLabel={labels.closeNavigation}
          items={navigation}
          label={labels.navigation}
          openLabel={labels.openNavigation}
        />
        <div className="app-shell__principal">
          <span className="app-shell__username">{username}</span>
          <span>{roleLabel}</span>
          <span>{labels.locale}: {locale}</span>
        </div>
        <form action="/logout" method="post">
          <Button className="app-shell__sign-out" type="submit" variant="outline">
            {labels.signOut}
          </Button>
        </form>
      </aside>
      <div className="app-shell__mobile-header">
        <div className="app-shell__identity">{identity}</div>
        <MobileShellNavigation
          closeLabel={labels.closeNavigation}
          items={navigation}
          label={labels.navigation}
          openLabel={labels.openNavigation}
          signOutLabel={labels.signOut}
        />
      </div>
      <main className="app-shell__content" id="app-shell-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

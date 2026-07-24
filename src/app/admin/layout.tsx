import type { ReactNode } from "react";

import { AppShell } from "@/app-shell/app-shell";
import type { ShellNavigationItem } from "@/app-shell/shell-types";
import { BrandIdentity } from "@/brand/brand-identity";

import { requireAdminShellContext } from "./shell-context";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const navigation: readonly ShellNavigationItem[] = [
    { href: "/admin", label: dictionary.shellDashboard },
    { href: "/admin/orders", label: dictionary.shellOrders },
    { href: "/admin/payment-links", label: dictionary.shellLinks },
    { href: "/admin/accounts", label: dictionary.shellUsers },
    { href: "/admin/settings", label: dictionary.shellSettings },
  ];

  return (
    <AppShell
      identity={<BrandIdentity variant="compact-role-lockup" />}
      labels={{
        closeNavigation: dictionary.shellCloseNavigation,
        locale: dictionary.shellLocale,
        navigation: dictionary.shellAdminNavigation,
        openNavigation: dictionary.shellOpenNavigation,
        signOut: dictionary.signOut,
        skipToContent: dictionary.shellSkipToContent,
      }}
      locale={locale}
      navigation={navigation}
      roleLabel={dictionary.shellAdministrator}
      username={principal.username}
    >
      {children}
    </AppShell>
  );
}

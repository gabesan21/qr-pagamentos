import type { ReactNode } from "react";
import { ClipboardListIcon, LayoutDashboardIcon, LinkIcon, SettingsIcon, UsersIcon } from "lucide-react";

import { AppShell } from "@/app-shell/app-shell";
import type { ShellNavigationItem } from "@/app-shell/shell-types";
import { BrandIdentity } from "@/brand/brand-identity";

import { requireAdminShellContext } from "./shell-context";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const navigation: readonly ShellNavigationItem[] = [
    { href: "/admin", icon: <LayoutDashboardIcon />, label: dictionary.shellDashboard },
    { href: "/admin/orders", icon: <ClipboardListIcon />, label: dictionary.shellOrders },
    { href: "/admin/payment-links", icon: <LinkIcon />, label: dictionary.shellLinks },
    { href: "/admin/accounts", icon: <UsersIcon />, label: dictionary.shellUsers },
    { href: "/admin/settings", icon: <SettingsIcon />, label: dictionary.shellSettings },
  ];

  return (
    <AppShell
      identity={<BrandIdentity variant="compact-role-lockup" />}
      labels={{
        accountMenu: dictionary.shellAccountMenu,
        closeNavigation: dictionary.shellCloseNavigation,
        copyright: dictionary.shellCopyright,
        language: dictionary.shellLanguage,
        locale: dictionary.shellLocale,
        navigation: dictionary.shellAdminNavigation,
        openNavigation: dictionary.shellOpenNavigation,
        privacy: dictionary.shellPrivacy,
        profile: dictionary.shellProfile,
        signOut: dictionary.signOut,
        skipToContent: dictionary.shellSkipToContent,
        storefront: dictionary.shellStorefront,
      }}
      locale={locale}
      navigation={navigation}
      pageTitle={dictionary.shellAdminEyebrow}
      roleLabel={dictionary.shellAdministrator}
      username={principal.username}
    >
      {children}
    </AppShell>
  );
}

import type { ReactNode } from "react";
import { ClipboardListIcon, LayoutDashboardIcon, LinkIcon, SettingsIcon, UsersIcon } from "lucide-react";

import { AppShell } from "@/app-shell/app-shell";
import type { ShellNavigationItem, ShellThemeOption, ShellTitleRoute } from "@/app-shell/shell-types";
import { BrandIdentity } from "@/brand/brand-identity";
import { THEME_PREFERENCE_LABEL_KEYS } from "@/design-system/theme-preference";
import { STOREFRONT_THEME_IDS } from "@/design-system/themes";

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
  const titleRoutes: readonly ShellTitleRoute[] = navigation.map(({ href, label }) => ({ href, label }));
  const themeOptions: readonly ShellThemeOption[] = STOREFRONT_THEME_IDS.map((id) => ({
    id,
    label: dictionary[THEME_PREFERENCE_LABEL_KEYS[id]],
  }));

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
        railCaption: dictionary.shellRailCaption,
        signOut: dictionary.signOut,
        skipToContent: dictionary.shellSkipToContent,
        storefront: dictionary.shellStorefront,
        themeMenu: dictionary.shellThemeMenu,
      }}
      locale={locale}
      navigation={navigation}
      roleLabel={dictionary.shellAdministrator}
      themeOptions={themeOptions}
      titleFallback={dictionary.shellDashboard}
      titleRoutes={titleRoutes}
      username={principal.username}
    >
      {children}
    </AppShell>
  );
}

import type { ReactNode } from "react";
import { ClipboardListIcon, LayoutDashboardIcon, LinkIcon, PackageIcon, SettingsIcon } from "lucide-react";

import { AppShell } from "@/app-shell/app-shell";
import type { ShellNavigationItem, ShellThemeOption, ShellTitleRoute } from "@/app-shell/shell-types";
import { BrandIdentity } from "@/brand/brand-identity";
import { THEME_PREFERENCE_LABEL_KEYS } from "@/design-system/theme-preference";
import { STOREFRONT_THEME_IDS } from "@/design-system/themes";

import { requireMerchantShellContext } from "./shell-context";

export default async function MerchantLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { dictionary, locale, principal, storefrontLink } = await requireMerchantShellContext();
  const navigation: readonly ShellNavigationItem[] = [
    { href: "/", icon: <LayoutDashboardIcon />, label: dictionary.shellDashboard },
    { href: "/orders", icon: <ClipboardListIcon />, label: dictionary.shellOrders },
    { href: "/links", icon: <LinkIcon />, label: dictionary.shellLinks },
    { href: "/catalog", icon: <PackageIcon />, label: dictionary.shellProducts },
    { href: "/settings", icon: <SettingsIcon />, label: dictionary.shellSettings },
  ];
  const titleRoutes: readonly ShellTitleRoute[] = [
    ...navigation.map(({ href, label }) => ({ href, label })),
    { href: "/profile", label: dictionary.profileLink },
  ];
  const themeOptions: readonly ShellThemeOption[] = STOREFRONT_THEME_IDS.map((id) => ({
    id,
    label: dictionary[THEME_PREFERENCE_LABEL_KEYS[id]],
  }));

  return (
    <AppShell
      identity={<BrandIdentity variant="merchant-fallback" />}
      labels={{
        accountMenu: dictionary.shellAccountMenu,
        closeNavigation: dictionary.shellCloseNavigation,
        copyright: dictionary.shellCopyright,
        language: dictionary.shellLanguage,
        locale: dictionary.shellLocale,
        navigation: dictionary.shellMerchantNavigation,
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
      profileLink={{ href: "/profile", label: dictionary.profileLink }}
      roleLabel={dictionary.shellMerchant}
      storefrontLink={storefrontLink}
      themeOptions={themeOptions}
      titleFallback={dictionary.shellDashboard}
      titleRoutes={titleRoutes}
      username={principal.username}
    >
      {children}
    </AppShell>
  );
}

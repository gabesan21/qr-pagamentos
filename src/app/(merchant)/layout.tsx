import type { ReactNode } from "react";
import { ClipboardListIcon, LayoutDashboardIcon, LinkIcon, PackageIcon, SettingsIcon } from "lucide-react";

import { AppShell } from "@/app-shell/app-shell";
import type { ShellNavigationItem } from "@/app-shell/shell-types";
import { BrandIdentity } from "@/brand/brand-identity";

import { requireMerchantShellContext } from "./shell-context";

export default async function MerchantLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const navigation: readonly ShellNavigationItem[] = [
    { href: "/", icon: <LayoutDashboardIcon />, label: dictionary.shellDashboard },
    { href: "/orders", icon: <ClipboardListIcon />, label: dictionary.shellOrders },
    { href: "/links", icon: <LinkIcon />, label: dictionary.shellLinks },
    { href: "/catalog", icon: <PackageIcon />, label: dictionary.shellProducts },
    { href: "/settings", icon: <SettingsIcon />, label: dictionary.shellSettings },
  ];

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
        signOut: dictionary.signOut,
        skipToContent: dictionary.shellSkipToContent,
        storefront: dictionary.shellStorefront,
      }}
      locale={locale}
      navigation={navigation}
      pageTitle={dictionary.shellMerchantEyebrow}
      profileLink={{ href: "/profile", label: dictionary.profileLink }}
      roleLabel={dictionary.shellMerchant}
      username={principal.username}
    >
      {children}
    </AppShell>
  );
}

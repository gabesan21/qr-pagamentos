import type { ReactNode } from "react";

import { AppShell } from "@/app-shell/app-shell";
import type { ShellNavigationItem } from "@/app-shell/shell-types";
import { BrandIdentity } from "@/brand/brand-identity";

import { requireMerchantShellContext } from "./shell-context";

export default async function MerchantLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const navigation: readonly ShellNavigationItem[] = [
    { href: "/", label: dictionary.shellDashboard },
    { href: "/orders", label: dictionary.shellOrders },
    { href: "/links", label: dictionary.shellLinks },
    { href: "/catalog", label: dictionary.shellProducts },
    { href: "/settings", label: dictionary.shellSettings },
  ];

  return (
    <AppShell
      identity={<BrandIdentity variant="merchant-fallback" />}
      labels={{
        closeNavigation: dictionary.shellCloseNavigation,
        locale: dictionary.shellLocale,
        navigation: dictionary.shellMerchantNavigation,
        openNavigation: dictionary.shellOpenNavigation,
        signOut: dictionary.signOut,
        skipToContent: dictionary.shellSkipToContent,
      }}
      locale={locale}
      navigation={navigation}
      profileLink={{ href: "/profile", label: dictionary.profileLink }}
      roleLabel={dictionary.shellMerchant}
      username={principal.username}
    >
      {children}
    </AppShell>
  );
}

import type { ReactNode } from "react";

export type ShellNavigationItem = Readonly<{
  href: string;
  icon: ReactNode;
  label: string;
}>;

export type ShellLabels = Readonly<{
  accountMenu: string;
  closeNavigation: string;
  copyright: string;
  language: string;
  locale: string;
  navigation: string;
  openNavigation: string;
  privacy: string;
  profile: string;
  signOut: string;
  skipToContent: string;
  storefront: string;
}>;

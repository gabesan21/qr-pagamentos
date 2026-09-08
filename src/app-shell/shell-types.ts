import type { ReactNode } from "react";

import type { StorefrontThemeId } from "@/design-system/themes";

export type ShellNavigationItem = Readonly<{
  href: string;
  icon: ReactNode;
  label: string;
}>;

// An inert theme choice presented to the account menu: an id from the closed
// registry plus its already-localized name. No business DTO, no service
// value.
export type ShellThemeOption = Readonly<{
  id: StorefrontThemeId;
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
  // Optional so shells that predate the theme picker keep compiling; every
  // role layout in this application supplies it.
  themeMenu?: string;
}>;

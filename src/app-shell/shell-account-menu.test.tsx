// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { TopBarShellControls } from "./shell-navigation";
import type { ShellLabels } from "./shell-types";

afterEach(cleanup);

const labels: ShellLabels = {
  accountMenu: "Account menu",
  closeNavigation: "Close navigation",
  copyright: "Copyright",
  language: "Language",
  locale: "Locale",
  navigation: "Navigation",
  openNavigation: "Open navigation",
  privacy: "Privacy",
  profile: "Profile",
  signOut: "Sign out",
  skipToContent: "Skip to content",
  storefront: "Storefront",
};

function renderShell(accountLink?: Readonly<{ href: string; label: string }>) {
  return render(
    <TopBarShellControls
      accountLink={accountLink}
      identity={<span>Identity</span>}
      labels={labels}
      locale="en"
      mobileNavigation={{ items: [], label: "Navigation" }}
      pageTitle="Dashboard"
      roleLabel="Merchant"
      username="merchant.one"
    />,
  );
}

// The account panel must always offer Sign out, for the merchant (with a
// Profile link) and the administrator (without one, since admins have no
// profile route).
describe("account menu Sign out", () => {
  it("always renders a real /logout POST form and Sign out item, with a Profile link when provided", () => {
    renderShell({ href: "/profile", label: "Profile" });
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));

    const signOutItem = screen.getByRole("menuitem", { name: /sign out/i });
    expect(signOutItem.tagName).toBe("BUTTON");
    const form = signOutItem.closest("form");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("action")).toBe("/logout");
    expect(form?.getAttribute("method")).toBe("post");
    // The form sits between role="menu" and role="menuitem": it must not
    // register as a foreign node in the accessibility tree.
    expect(form?.getAttribute("role")).toBe("none");

    expect(screen.getByRole("menuitem", { name: /profile/i })).not.toBeNull();
  });

  it("still renders Sign out with no Profile link, for roles without a profile route", () => {
    renderShell(undefined);
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.getByRole("menuitem", { name: /sign out/i })).not.toBeNull();
    expect(screen.queryByRole("menuitem", { name: /profile/i })).toBeNull();
  });
});

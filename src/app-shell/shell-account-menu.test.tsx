// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn(() => "/a") }));
vi.mock("next/navigation", () => ({ usePathname }));

import { ShellAccountMenu } from "./shell-navigation";
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
  railCaption: "by Nautt Finance",
  signOut: "Sign out",
  skipToContent: "Skip to content",
  storefront: "Storefront",
};

function renderShell(accountLink?: Readonly<{ href: string; label: string }>) {
  return render(
    <ShellAccountMenu
      profileLink={accountLink}
      labels={labels}
      roleLabel="Merchant"
      themeOptions={[]}
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

    const signOutItem = screen.getByRole("button", { name: /sign out/i });
    expect(signOutItem.tagName).toBe("BUTTON");
    const form = signOutItem.closest("form");
    expect(form).not.toBeNull();
    expect(form?.getAttribute("action")).toBe("/logout");
    expect(form?.getAttribute("method")).toBe("post");
    expect(screen.getByRole("link", { name: /profile/i })).not.toBeNull();
  });

  it("still renders Sign out with no Profile link, for roles without a profile route", () => {
    renderShell(undefined);
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.getByRole("button", { name: /sign out/i })).not.toBeNull();
    expect(screen.queryByRole("link", { name: /profile/i })).toBeNull();
  });

  it("does not reopen a prior pathname's menu after navigation away and back", () => {
    usePathname.mockReturnValue("/a");
    const view = renderShell();
    fireEvent.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByRole("dialog", { name: /account menu/i })).not.toBeNull();

    usePathname.mockReturnValue("/b");
    view.rerender(<ShellAccountMenu labels={labels} roleLabel="Merchant" themeOptions={[]} username="merchant.one" />);
    expect(screen.queryByRole("dialog", { name: /account menu/i })).toBeNull();

    usePathname.mockReturnValue("/a");
    view.rerender(<ShellAccountMenu labels={labels} roleLabel="Merchant" themeOptions={[]} username="merchant.one" />);
    expect(screen.queryByRole("dialog", { name: /account menu/i })).toBeNull();
  });
});

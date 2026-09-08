// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dictionaryDomains } from "@/i18n/dictionaries/domains";

import { isActiveRoute, TopBarShellControls } from "./shell-navigation";
import { AppShell } from "./app-shell";
import type { ShellLabels, ShellTitleRoute } from "./shell-types";

const root = process.cwd();

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

const titleRoutes: readonly ShellTitleRoute[] = [
  { href: "/orders", label: "Orders" },
  { href: "/admin/orders", label: "Orders" },
];

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn(() => "/") }));
vi.mock("next/navigation", () => ({ usePathname }));

describe("role shell contract", () => {
  it("matches dashboard roots exactly and descendants on segment boundaries", () => {
    expect(isActiveRoute("/", "/")).toBe(true);
    expect(isActiveRoute("/orders/one", "/orders")).toBe(true);
    expect(isActiveRoute("/orders-archive", "/orders")).toBe(false);
    expect(isActiveRoute("/admin", "/admin")).toBe(true);
    expect(isActiveRoute("/admin/orders", "/admin")).toBe(false);
    expect(isActiveRoute("/admin/orders/one", "/admin/orders")).toBe(true);
  });

  it("keeps the shell dictionary domain in exact bilingual parity", () => {
    expect(Object.keys(dictionaryDomains.appShell.en).sort()).toEqual(
      Object.keys(dictionaryDomains.appShell["pt-BR"]).sort(),
    );
  });

  it("keeps the shell frame server-only and inert", () => {
    const source = readFileSync(`${root}/src/app-shell/app-shell.tsx`, "utf8");
    expect(source).not.toContain('"use client"');
    expect(source).not.toMatch(/@\/auth|@\/orders|@\/integrations|@\/media/);
  });

  it("keeps the client boundary free of authentication and business imports", () => {
    const source = readFileSync(`${root}/src/app-shell/shell-navigation.tsx`, "utf8");
    expect(source).toContain('"use client"');
    expect(source).not.toMatch(/@\/auth|@\/orders|@\/integrations|@\/media/);
  });

  it("keeps the second client boundary (shell-theme-picker.tsx) free of authentication and business imports", () => {
    const source = readFileSync(`${root}/src/app-shell/shell-theme-picker.tsx`, "utf8");
    expect(source).toContain('"use client"');
    expect(source).not.toMatch(/@\/auth|@\/orders|@\/integrations|@\/media/);
  });

  it("fixes five distinct routes with icons for each persona", () => {
    const admin = readFileSync(`${root}/src/app/admin/layout.tsx`, "utf8");
    const merchant = readFileSync(`${root}/src/app/(merchant)/layout.tsx`, "utf8");
    const adminNavigation = admin.match(/const navigation[\s\S]*?= \(([\s\S]*?)\);/)?.[1]
      ?? admin.match(/const navigation[\s\S]*?= \[([\s\S]*?)\];/)?.[1]
      ?? "";
    const merchantNavigation = merchant.match(/const navigation[\s\S]*?= \(([\s\S]*?)\);/)?.[1]
      ?? merchant.match(/const navigation[\s\S]*?= \[([\s\S]*?)\];/)?.[1]
      ?? "";
    expect(adminNavigation.match(/href:/g)).toHaveLength(5);
    expect(merchantNavigation.match(/href:/g)).toHaveLength(5);
    expect(adminNavigation.match(/icon:/g)).toHaveLength(5);
    expect(merchantNavigation.match(/icon:/g)).toHaveLength(5);
    expect(admin).not.toContain('href: "/"');
    expect(merchant).not.toContain('href: "/admin"');
    expect(merchant).toContain('profileLink={{ href: "/profile"');
    expect(admin).not.toContain("profileLink=");
    expect(admin).not.toContain("storefrontLink=");
  });

  it("resolves the top-bar title from the registry for a matching route", () => {
    usePathname.mockReturnValue("/admin/orders");
    render(
      <TopBarShellControls
        identity={<span>Identity</span>}
        labels={labels}
        locale="en"
        mobileNavigation={{ items: [], label: "Navigation" }}
        roleLabel="Administrator"
        titleFallback="Dashboard"
        titleRoutes={titleRoutes}
        username="admin.one"
      />,
    );

    expect(screen.getByText("Orders")).not.toBeNull();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("falls back to the dashboard label when the active route matches no registered title route", () => {
    usePathname.mockReturnValue("/admin/settings");
    render(
      <TopBarShellControls
        identity={<span>Identity</span>}
        labels={labels}
        locale="en"
        mobileNavigation={{ items: [], label: "Navigation" }}
        roleLabel="Administrator"
        titleFallback="Dashboard"
        titleRoutes={titleRoutes}
        username="admin.one"
      />,
    );

    expect(screen.getByText("Dashboard")).not.toBeNull();
  });

  it("keeps the rail/drawer switch pinned to the lg law (63.9375rem) and not the retired 768px/48rem breakpoint", () => {
    const css = readFileSync(`${root}/src/app-shell/app-shell.css`, "utf8");
    expect(css).toContain("@media (max-width: 63.9375rem)");
    expect(css).not.toContain("768px");
    expect(css).not.toContain("48rem)");
  });

  it("renders the rail footer as monogram, username, role pill, and the Nautt Finance caption, with no sign-out in the rail", () => {
    usePathname.mockReturnValue("/");
    render(
      <AppShell
        identity={<span>Identity</span>}
        labels={labels}
        locale="en"
        navigation={[]}
        roleLabel="Merchant"
        titleFallback="Dashboard"
        titleRoutes={[]}
        username="merchant.one"
      >
        <div>content</div>
      </AppShell>,
    );

    const rail = document.querySelector(".app-shell__rail");
    expect(rail).not.toBeNull();
    expect(rail?.querySelector(".app-shell__username")?.textContent).toBe("merchant.one");
    expect(rail?.querySelector(".app-shell__rail-role-pill")?.textContent).toBe("Merchant");
    expect(rail?.querySelector(".app-shell__rail-caption")?.textContent).toBe("by Nautt Finance");
    expect(rail?.querySelector("form[action='/logout']")).toBeNull();
    expect(rail?.querySelector("button")).toBeNull();

    const monogram = rail?.querySelector(".app-shell__rail-principal > span");
    expect(monogram?.className).toContain("rounded-full");
    expect(monogram?.textContent).toBe("M");
  });
});

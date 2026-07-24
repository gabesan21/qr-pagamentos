import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { dictionaryDomains } from "@/i18n/dictionaries/domains";

import { isActiveRoute } from "./shell-navigation";

const root = fileURLToPath(new URL("../..", import.meta.url));

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

  it("keeps the client boundary free of authentication and business imports", () => {
    const source = readFileSync(`${root}/src/app-shell/shell-navigation.tsx`, "utf8");
    expect(source).toContain('"use client"');
    expect(source).not.toMatch(/@\/auth|@\/orders|@\/integrations|@\/media/);
  });

  it("fixes five distinct routes for each persona", () => {
    const admin = readFileSync(`${root}/src/app/admin/layout.tsx`, "utf8");
    const merchant = readFileSync(`${root}/src/app/(merchant)/layout.tsx`, "utf8");
    const adminNavigation = admin.match(/const navigation[\s\S]*?= \[([\s\S]*?)\];/)?.[1] ?? "";
    const merchantNavigation = merchant.match(/const navigation[\s\S]*?= \[([\s\S]*?)\];/)?.[1] ?? "";
    expect(adminNavigation.match(/href:/g)).toHaveLength(5);
    expect(merchantNavigation.match(/href:/g)).toHaveLength(5);
    expect(admin).not.toContain('href: "/"');
    expect(merchant).not.toContain('href: "/admin"');
    expect(merchant).toContain('profileLink={{ href: "/profile"');
    expect(admin).not.toContain("profileLink=");
  });
});

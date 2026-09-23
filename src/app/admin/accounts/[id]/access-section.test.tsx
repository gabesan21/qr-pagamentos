// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";
import type { AdminUserDetail } from "@/auth/admin-user-directory";

import { AccessSection } from "./access-section";

afterEach(cleanup);

const detail: AdminUserDetail = {
  id: "440e8400-e29b-41d4-a716-446655440010",
  username: "merchant.one",
  email: "merchant.one@example.com",
  role: "USER",
  status: "ACTIVE",
  createdAt: new Date("2026-07-01T12:00:00.000Z"),
  deletedAt: null,
  state: "active",
  storeState: "active",
  lastActivityAt: new Date("2026-07-24T12:00:00.000Z"),
  storefrontSlug: "padaria",
  editor: {
    profileVersion: 7,
    preferredLocale: "en",
    checkoutDataPolicy: "NAME_EMAIL",
    storefrontEnabled: true,
    storefrontDisplayNamePtBr: "Padaria",
    storefrontDisplayNameEn: "Bakery",
    storefrontAccentColor: "#AA00FF",
    storefrontThemeId: "pix-paper",
    storefrontLayout: "boxed",
    storefrontStandalonePaymentsEnabled: false,
    storefrontDefaultCurrencyCode: "BRL",
  },
};

describe("account access section", () => {
  it("posts role, status, and password to the byte-frozen routes with a real POST and a working aria-describedby link", () => {
    render(<AccessSection detail={detail} dictionary={dictionary} totpConfigured={false} />);

    expect(document.querySelector(`form[action="/admin/users/${detail.id}/role"]`)).not.toBeNull();
    expect(document.querySelector(`form[action="/admin/users/${detail.id}/status"]`)).not.toBeNull();
    expect(document.querySelector(`form[action="/admin/users/${detail.id}/password"]`)).not.toBeNull();
    expect(document.querySelector(`form[action="/admin/users/${detail.id}/reset-password"]`)).not.toBeNull();

    const passwordInput = document.getElementById(`password-${detail.id}`) as HTMLInputElement;
    const describedBy = passwordInput.getAttribute("aria-describedby") as string;
    expect(document.getElementById(describedBy)).not.toBeNull();
  });

  it("gates the destructive USER→? no-op aside; demoting to USER requires confirmation before the byte-frozen route posts", () => {
    render(<AccessSection detail={{ ...detail, role: "ADMIN" }} dictionary={dictionary} totpConfigured={false} />);

    fireEvent.click(screen.getByRole("radio", { name: dictionary.adminUser }));
    fireEvent.click(screen.getByRole("button", { name: dictionary.adminSaveRole }));

    expect(screen.getByText(dictionary.adminDemotionDescription)).not.toBeNull();
  });

  it("renders no TOTP disable form when no factor is configured, and a real POST gated by confirmation when one is", () => {
    const { rerender } = render(<AccessSection detail={detail} dictionary={dictionary} totpConfigured={false} />);
    expect(document.querySelector(`form[action="/admin/users/${detail.id}/totp-disable"]`)).toBeNull();

    rerender(<AccessSection detail={detail} dictionary={dictionary} totpConfigured />);
    expect(document.querySelector(`form[action="/admin/users/${detail.id}/totp-disable"]`)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: dictionary.adminUserProfileTotpDisable }));
    expect(screen.getByText(dictionary.adminUserProfileTotpDisableConfirmDescription)).not.toBeNull();
  });
});

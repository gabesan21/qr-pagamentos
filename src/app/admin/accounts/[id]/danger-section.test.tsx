// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";
import type { AdminUserDetail } from "@/auth/admin-user-directory";

import { DangerSection } from "./danger-section";

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

describe("account danger zone", () => {
  it("gates the byte-frozen delete route behind exact-username confirmation, not a bare 'are you sure?'", () => {
    render(<DangerSection detail={detail} dictionary={dictionary} />);

    fireEvent.click(screen.getByRole("button", { name: dictionary.adminUsersDirectoryDelete }));

    const dialogInput = screen.getByLabelText(dictionary.adminUserProfileDeleteConfirmFieldLabel) as HTMLInputElement;
    const confirmButton = screen.getAllByRole("button", { name: dictionary.adminUsersDirectoryDelete }).at(-1) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(dialogInput, { target: { value: "wrong-name" } });
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(dialogInput, { target: { value: detail.username } });
    expect(confirmButton.disabled).toBe(false);

    const form = document.querySelector(`form[action="/admin/users/${detail.id}/delete"]`) as HTMLFormElement;
    expect(form).not.toBeNull();
    expect(form.getAttribute("method")).toBe("post");
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";
import type { AdminUserDetail } from "@/auth/admin-user-directory";

import { PreferencesSection } from "./preferences-section";

class PreferencesResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}
globalThis.ResizeObserver = PreferencesResizeObserver;

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

describe("account preferences section", () => {
  it("posts locale and checkout policy to the byte-frozen routes, Save disabled until a value diverges", () => {
    render(<PreferencesSection detail={detail} dictionary={dictionary} />);

    expect(document.querySelector(`form[action="/admin/users/${detail.id}/locale"]`)).not.toBeNull();
    expect(document.querySelector(`form[action="/admin/users/${detail.id}/checkout-policy"]`)).not.toBeNull();

    const localeSave = screen.getByRole("button", { name: dictionary.adminUserProfileLocaleSave }) as HTMLButtonElement;
    expect(localeSave.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Português (Brasil)" }));
    expect(localeSave.disabled).toBe(false);

    const policySave = screen.getByRole("button", { name: dictionary.adminUserProfileCheckoutSave }) as HTMLButtonElement;
    expect(policySave.disabled).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: dictionary.checkoutPolicyEmail }));
    expect(policySave.disabled).toBe(false);
  });
});

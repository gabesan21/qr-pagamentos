// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { en as dictionary } from "@/i18n/dictionaries/en";
import type { AdminUserDetail } from "@/auth/admin-user-directory";

import { StorefrontSection } from "./storefront-section";

class StorefrontResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}
globalThis.ResizeObserver = StorefrontResizeObserver;

afterEach(cleanup);

function detail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
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
    ...overrides,
  };
}

const currencyChoices = [{ code: "BRL", label: "Brazilian real" }];

describe("account storefront section", () => {
  it("posts to the byte-frozen storefront route with the current editable values as form defaults", () => {
    render(
      <StorefrontSection
        accentField={<span data-testid="accent-field" />}
        currencyChoices={currencyChoices}
        detail={detail()}
        dictionary={dictionary}
      />,
    );

    const target = detail();
    expect(document.querySelector(`form[action="/admin/users/${target.id}/storefront"]`)).not.toBeNull();
    expect(screen.getByDisplayValue("padaria")).not.toBeNull();
    expect(screen.getAllByDisplayValue("Padaria").length).toBeGreaterThan(0);
    expect(screen.getByText("Brazilian real (BRL)")).not.toBeNull();
    expect(screen.getByTestId("accent-field")).not.toBeNull();
    // The owner-fenced logo media field never renders here.
    expect(document.querySelector('[name="storefrontLogoMediaIdentifier"]')).toBeNull();
  });

  it("links to the sessionless public store only when enabled and slugged", () => {
    render(
      <StorefrontSection accentField={null} currencyChoices={currencyChoices} detail={detail()} dictionary={dictionary} />,
    );
    expect(screen.getByRole("link", { name: dictionary.adminUserProfileStoreLink }).getAttribute("href")).toBe("/store/padaria");
  });

  it("renders the explicit store-unavailable state without a link when disabled", () => {
    render(
      <StorefrontSection
        accentField={null}
        currencyChoices={currencyChoices}
        detail={detail({ editor: { ...detail().editor, storefrontEnabled: false } })}
        dictionary={dictionary}
      />,
    );
    expect(screen.getByText(dictionary.adminUserProfileStoreUnavailable)).not.toBeNull();
    expect(screen.queryByRole("link", { name: dictionary.adminUserProfileStoreLink })).toBeNull();
  });

  it("renders the explicit store-unavailable state without a link when slugless", () => {
    render(
      <StorefrontSection
        accentField={null}
        currencyChoices={currencyChoices}
        detail={detail({ storefrontSlug: null })}
        dictionary={dictionary}
      />,
    );
    expect(screen.getByText(dictionary.adminUserProfileStoreUnavailable)).not.toBeNull();
  });

  it("links the layout segmented-control group label without a dangling htmlFor", () => {
    render(
      <StorefrontSection accentField={null} currencyChoices={currencyChoices} detail={detail()} dictionary={dictionary} />,
    );
    const label = screen.getByText(dictionary.storefrontLayoutLabel);
    expect(label.getAttribute("for")).toBeNull();
  });
});

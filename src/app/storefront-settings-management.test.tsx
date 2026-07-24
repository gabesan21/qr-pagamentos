import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";
import { StorefrontSettingsManagement } from "./storefront-settings-management";

const settings = {
  storefrontSlug: "my-store",
  storefrontDisplayNamePtBr: "Minha Loja",
  storefrontDisplayNameEn: null,
  storefrontAccentColor: "#1A2B3C",
  storefrontEnabled: true,
  storefrontThemeId: null,
  storefrontLayout: null,
  storefrontLogoMediaIdentifier: null,
  storefrontStandalonePaymentsEnabled: true,
  storefrontDefaultCurrencyCode: null,
};

const choices = [
  { code: "BRL", label: "Brazilian real" },
  { code: "USD", label: "US dollar" },
] as const;

function render(overrides: Readonly<Partial<Parameters<typeof StorefrontSettingsManagement>[0]>> = {}) {
  return renderToStaticMarkup(
    <StorefrontSettingsManagement
      currencyChoices={choices}
      dictionary={getDictionary("en")}
      locale="en"
      settings={settings}
      stagedLogoMediaIdentifier={null}
      {...overrides}
    />,
  );
}

describe("storefront settings management", () => {
  it.each([
    ["en", "Storefront address slug", "Enable the public storefront", "Save storefront settings"],
    ["pt-BR", "Slug do endereço da vitrine", "Ativar a vitrine pública", "Salvar configurações da vitrine"],
  ] as const)("renders the populated legacy form in %s byte-identically", (locale, slugLabel, enabledLabel, save) => {
    const markup = render({ dictionary: getDictionary(locale), locale });
    expect(markup).toContain('action="/storefront"');
    expect(markup).toContain('name="storefrontSlug"');
    expect(markup).toContain('value="my-store"');
    expect(markup).toContain('value="Minha Loja"');
    expect(markup).toContain('value="#1A2B3C"');
    expect(markup).toContain(slugLabel);
    expect(markup).toContain(enabledLabel);
    expect(markup).toContain(save);
    expect(markup).toContain('name="storefrontEnabled"');
    expect(markup).toContain('aria-checked="true"');
  });

  it.each(["en", "pt-BR"] as const)("renders the four section headings in %s", (locale) => {
    const dictionary = getDictionary(locale);
    const markup = render({ dictionary, locale });
    expect(markup).toContain(dictionary.storefrontIdentityHeading);
    expect(markup).toContain(dictionary.storefrontAppearanceHeading);
    expect(markup).toContain(dictionary.storefrontPaymentsHeading);
    expect(markup).toContain(dictionary.storefrontCurrencyHeading);
  });

  it("resolves the stored-null theme and layout to the design-system fallbacks and lists all six themes", () => {
    const markup = render();
    expect(markup).toContain('name="storefrontThemeId"');
    expect(markup).toContain('name="storefrontLayout"');
    for (const id of ["pix-paper", "cashier-daylight", "settlement-sand", "midnight-clearing", "vault-blue", "terminal-amber"]) {
      expect(markup).toContain(`value="${id}"`);
    }
    expect(markup).toContain('value="pix-paper" selected=""');
    expect(markup).toContain('value="boxed" selected=""');
  });

  it("lists only the active redacted currency choices plus the no-default option", () => {
    const markup = render({ settings: { ...settings, storefrontDefaultCurrencyCode: "USD" } });
    expect(markup).toContain("Brazilian real (BRL)");
    expect(markup).toContain("US dollar (USD)");
    expect(markup).toContain('value="USD" selected=""');
    expect(markup).not.toContain("currencyUuid");
    expect(markup).toContain('value=""');
  });

  it.each(["en", "pt-BR"] as const)("renders the disabled explained currency state when no mapping is active in %s", (locale) => {
    const dictionary = getDictionary(locale);
    const markup = render({ currencyChoices: [], dictionary, locale });
    expect(markup).toContain('disabled="" id="storefront-currency"');
    expect(markup).toContain(dictionary.storefrontCurrencyUnavailable);
    expect(markup).toContain(dictionary.storefrontCurrencyNone);
  });

  it("renders the standalone toggle with its mirrored hidden field", () => {
    const markup = render();
    expect(markup).toContain(getDictionary("en").storefrontStandalonePaymentsLabel);
    expect(markup).toContain('name="storefrontStandalonePaymentsEnabled"');
    expect(markup).toContain('name="storefrontStandalonePaymentsEnabled" value="true"');
    const off = render({ settings: { ...settings, storefrontStandalonePaymentsEnabled: false } });
    expect(off).toContain('name="storefrontStandalonePaymentsEnabled" value="false"');
  });

  it("shows the official fallback lockup without a logo and the staged identifier with one", () => {
    const withoutLogo = render();
    expect(withoutLogo).toContain('data-brand-identity="merchant-fallback"');
    expect(withoutLogo).toContain('name="storefrontLogoMediaIdentifier"');
    expect(withoutLogo).toContain('name="storefrontLogoMediaIdentifier" value=""');

    const staged = "s".repeat(43);
    const withLogo = render({ stagedLogoMediaIdentifier: staged, logoNotice: "staged" });
    expect(withLogo).toContain(`/media/${staged}`);
    expect(withLogo).toContain(`name="storefrontLogoMediaIdentifier" value="${staged}"`);
    expect(withLogo).toContain('role="status"');
    expect(withLogo).toContain(getDictionary("en").storefrontLogoStaged);
  });

  it("renders the opaque upload failure without detail", () => {
    const markup = render({ logoNotice: "failed" });
    expect(markup).toContain(getDictionary("en").storefrontLogoUploadFailed);
    expect(markup).not.toMatch(/quota|decoder|signature/);
  });

  it("posts the logo upload to the staging route with the bounded accept hint", () => {
    const markup = render();
    expect(markup).toContain('action="/storefront/logo"');
    expect(markup).toContain('multipart/form-data');
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(markup).toContain('type="file"');
  });

  it("renders the disabled defaults as an empty, unchecked form", () => {
    const markup = render({
      settings: {
        storefrontSlug: null,
        storefrontDisplayNamePtBr: null,
        storefrontDisplayNameEn: null,
        storefrontAccentColor: null,
        storefrontEnabled: false,
        storefrontThemeId: null,
        storefrontLayout: null,
        storefrontLogoMediaIdentifier: null,
        storefrontStandalonePaymentsEnabled: true,
        storefrontDefaultCurrencyCode: null,
      },
    });
    expect(markup).toContain('value=""');
    expect(markup).toContain('aria-checked="false"');
  });
});

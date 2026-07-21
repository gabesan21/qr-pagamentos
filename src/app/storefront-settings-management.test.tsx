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
};

describe("storefront settings management", () => {
  it.each([
    ["en", "Storefront address slug", "Enable the public storefront", "Save storefront settings"],
    ["pt-BR", "Slug do endereço da vitrine", "Ativar a vitrine pública", "Salvar configurações da vitrine"],
  ] as const)("renders the populated form in %s", (locale, slugLabel, enabledLabel, save) => {
    const markup = renderToStaticMarkup(<StorefrontSettingsManagement dictionary={getDictionary(locale)} settings={settings} />);
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

  it("renders the disabled defaults as an empty, unchecked form", () => {
    const markup = renderToStaticMarkup(<StorefrontSettingsManagement dictionary={getDictionary("en")} settings={{ storefrontSlug: null, storefrontDisplayNamePtBr: null, storefrontDisplayNameEn: null, storefrontAccentColor: null, storefrontEnabled: false }} />);
    expect(markup).toContain('value=""');
    expect(markup).toContain('aria-checked="false"');
  });
});

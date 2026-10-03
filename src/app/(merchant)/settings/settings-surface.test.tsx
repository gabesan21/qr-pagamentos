import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "@/i18n/dictionaries";

import { SettingsSurface } from "./settings-surface";

const emptyCredential = { hasCredential: false, credentialRevision: null, webhookRegistrationState: null, updatedAt: null };

const storefrontSettings = {
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

function markup(locale: "en" | "pt-BR" = "en") {
  return renderToStaticMarkup(
    <SettingsSurface
      checkoutPolicy="NONE"
      currencyChoices={[{ code: "BRL", label: "Brazilian real" }]}
      dictionary={getDictionary(locale)}
      locale={locale}
      nauttStatus={{ credential: emptyCredential, balance: null, balanceUnavailable: false }}
      notices={{}}
      stagedLogoMediaIdentifier={null}
      storefrontSettings={storefrontSettings}
    />,
  );
}

// The seven sections the nav enumerates: Nautt connection, checkout policy,
// storefront identity/appearance/payments/currency, and language.
const SECTION_IDS = ["connection", "policy", "identity", "store", "payments", "currency", "language"] as const;

describe("merchant settings surface", () => {
  it.each(["en", "pt-BR"] as const)("renders each section exactly once with one title, in %s", (locale) => {
    const html = markup(locale);
    for (const id of SECTION_IDS) {
      const sectionMatches = html.match(new RegExp(`id="settings-${id}"`, "g")) ?? [];
      const headingMatches = html.match(new RegExp(`id="settings-${id}-heading"`, "g")) ?? [];
      expect(sectionMatches).toHaveLength(1);
      // Nautt keeps its own internal heading structure as the known
      // exception; every other section carries exactly one <h2> title.
      if (id !== "connection") expect(headingMatches).toHaveLength(1);
    }
  });

  it("renders a nav link for every section, each href resolving to a real section id", () => {
    const html = markup("en");
    for (const id of SECTION_IDS) {
      expect(html).toContain(`href="#settings-${id}"`);
      expect(html).toContain(`id="settings-${id}"`);
    }
  });
});

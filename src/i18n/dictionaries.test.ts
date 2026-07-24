import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getDictionary } from "./dictionaries";
import { en } from "./dictionaries/en";
import { ptBR } from "./dictionaries/pt-BR";
import { dictionaryDomains } from "./dictionaries/domains";

describe("language dictionaries", () => {
  it("keeps the closed dictionaries in parity", () => {
    expect(Object.keys(ptBR).sort()).toEqual(Object.keys(en).sort());
  });

  it("keeps each domain bilingual without overlapping keys", () => {
    const seenKeys = new Set<string>();

    for (const [domainName, dictionaries] of Object.entries(dictionaryDomains)) {
      const ptBRKeys = Object.keys(dictionaries["pt-BR"]).sort();
      const enKeys = Object.keys(dictionaries.en).sort();

      expect(ptBRKeys, `${domainName} keys`).toEqual(enKeys);
      for (const key of enKeys) {
        expect(seenKeys.has(key), `${domainName}.${key} must be domain-owned`).toBe(false);
        seenKeys.add(key);
      }
    }

    expect([...seenKeys].sort()).toEqual(Object.keys(en).sort());
  });

  it("exposes the language-control copy for each supported locale", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const dictionary = getDictionary(locale);
      expect(dictionary.languageHeading).not.toBe("");
      expect(dictionary.loginHeading).not.toBe("");
      expect(dictionary.loginIntroduction).not.toBe("");
      expect(dictionary.usernameLabel).not.toBe("");
      expect(dictionary.passwordLabel).not.toBe("");
      expect(dictionary.signIn).not.toBe("");
      expect(dictionary.signingIn).not.toBe("");
      expect(dictionary.invalidCredentials).not.toBe("");
      expect(dictionary.languageLabel).not.toBe("");
      expect(dictionary.languageSave).not.toBe("");
      expect(dictionary.languageSaved).not.toBe("");
      expect(dictionary.languageError).not.toBe("");
      expect(dictionary.adminPaymentSettingsHeading).not.toBe("");
      expect(dictionary.adminSavePaymentSettings).not.toBe("");
      expect(dictionary.adminCatalogCurrencyPairsHeading).not.toBe("");
      expect(dictionary.adminCatalogPaymentMethodsHeading).not.toBe("");
      expect(dictionary.adminCatalogCreateCurrencyPair).not.toBe("");
      expect(dictionary.adminCatalogCreatePaymentMethod).not.toBe("");
      expect(dictionary.designSystemHeading).not.toBe("");
      expect(dictionary.designSystemRetry).not.toBe("");
    }
  });

  it("exposes every admin navigation, confirmation, loading, and recovery key in both locales", () => {
    const adminStateKeys = [
      "adminNavigationLabel", "adminHome", "signOut", "adminCancel",
      "adminDemotionTitle", "adminDemotionDescription", "adminConfirmDemotion",
      "adminDisableTitle", "adminDisableDescription", "adminConfirmDisable",
      "adminLoadingHeading", "adminLoadingDescription", "adminReadErrorHeading",
      "adminReadErrorDescription", "adminRetry",
      "adminProductsHeading", "adminProductsEmpty", "adminProductCreate",
      "adminProductDeleteConfirm", "adminProductConflict", "adminProductMutationFailed",
      "ordersHeading", "ordersDescription", "ordersEmpty", "ordersEmptyDescription",
      "ordersView", "orderBackToList", "orderPaymentLink", "orderProduct", "orderAmount",
      "orderCurrencyPair", "orderState", "orderCreated", "orderUpdated", "orderSettled",
      "orderUnavailableHeading", "orderUnavailableDescription",
      "storefrontHeading", "storefrontDescription", "storefrontSlugLabel", "storefrontSlugHelp",
      "storefrontDisplayNamePtBrLabel", "storefrontDisplayNameEnLabel",
      "storefrontAccentColorLabel", "storefrontAccentColorHelp",
      "storefrontEnabledLabel", "storefrontSave",
      "storefrontFallbackName", "storefrontIntroduction", "storefrontProductsHeading", "storefrontPriceLabel",
      "storefrontViewProduct", "storefrontEmptyHeading", "storefrontEmptyDescription",
      "storefrontUnavailableHeading", "storefrontUnavailableDescription",
    ] as const;

    for (const locale of ["pt-BR", "en"] as const) {
      const dictionary = getDictionary(locale);
      for (const key of adminStateKeys) expect(dictionary[key], `${locale}.${key}`).not.toBe("");
    }
  });
});

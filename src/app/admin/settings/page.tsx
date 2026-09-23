import { getNauttCatalogService } from "@/auth/nautt-catalog";
import { getPaymentSettingsService } from "@/auth/payment-settings";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { getSystemSettingsService } from "@/auth/system-settings";

import { AdminSettingsSurface, type CurrencyPair, type PaymentMethod } from "./settings-surface";
import type { SectionNotice } from "./settings-section-notice";
import { requireAdminShellContext } from "../shell-context";

export default async function AdminSettingsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; language?: string; success?: string }> }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const [settings, currencyPairs, paymentMethods, mappings, defaultThemeId, query] = await Promise.all([
    getPaymentSettingsService().list(principal),
    getNauttCatalogService().listCurrencyPairs(principal),
    getNauttCatalogService().listPaymentMethods(principal),
    getSupportedExchangeCurrencyService().listMappings(principal),
    getSystemSettingsService().getDefaultTheme(principal),
    searchParams,
  ]);

  // The two catalog outcomes (`catalog-created`/`catalog-changed`, raised by
  // `/admin/catalog/*`) cannot be attributed to §2 or §3 with the vocabulary
  // those routes emit today, so they stay a page-level notice; every other
  // outcome resolves into the section that owns its mutation route below.
  const notice: SectionNotice = query.success === "catalog-created"
    ? { tone: "success", text: dictionary.adminCatalogCreated }
    : query.success === "catalog-changed"
      ? { tone: "success", text: dictionary.adminCatalogChanged }
      : query.error === "catalog-create-failed"
        ? { tone: "error", text: dictionary.adminCatalogCreateFailed }
        : query.error === "catalog-change-failed"
          ? { tone: "error", text: dictionary.adminCatalogChangeFailed }
          : null;

  const exchangeCurrencyNotice: SectionNotice = query.success === "exchange-currency"
    ? { tone: "success", text: dictionary.adminExchangeCurrencySaved }
    : query.error === "exchange-currency-failed"
      ? { tone: "error", text: dictionary.adminExchangeCurrencyFailed }
      : null;

  const paymentSettingsNotice: SectionNotice = query.success === "settings"
    ? { tone: "success", text: dictionary.adminPaymentSettingsSaved }
    : query.error === "settings-failed"
      ? { tone: "error", text: dictionary.adminSettingsFailed }
      : null;

  const themeNotice: SectionNotice = query.success === "theme-default"
    ? { tone: "success", text: dictionary.adminThemeDefaultSaved }
    : query.error === "theme-default-failed"
      ? { tone: "error", text: dictionary.adminThemeDefaultFailed }
      : null;

  const languageNotice: SectionNotice = query.language === "saved"
    ? { tone: "success", text: dictionary.languageSaved }
    : query.language === "error"
      ? { tone: "error", text: dictionary.languageError }
      : null;

  return (
    <AdminSettingsSurface
      currencyPairs={currencyPairs.map<CurrencyPair>((pair) => ({
        id: pair.id,
        label: pair.label,
        currencyUuid: pair.currencyUuid,
        exchangeCurrencyUuid: pair.exchangeCurrencyUuid,
        active: pair.active,
        createdAt: pair.createdAt.toISOString(),
      }))}
      defaultThemeId={defaultThemeId}
      dictionary={dictionary}
      exchangeCurrencyNotice={exchangeCurrencyNotice}
      languageNotice={languageNotice}
      locale={locale}
      mappings={mappings}
      notice={notice}
      paymentMethods={paymentMethods.map<PaymentMethod>((method) => ({
        id: method.id,
        label: method.label,
        paymentMethodUuid: method.paymentMethodUuid,
        active: method.active,
        createdAt: method.createdAt.toISOString(),
      }))}
      paymentSettingsNotice={paymentSettingsNotice}
      settings={settings}
      themeNotice={themeNotice}
    />
  );
}

import { getNauttCatalogService } from "@/auth/nautt-catalog";
import { getPaymentSettingsService } from "@/auth/payment-settings";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { getSystemSettingsService } from "@/auth/system-settings";

import { AdminSettingsSurface, type CurrencyPair, type PaymentMethod } from "./settings-surface";
import { requireAdminShellContext } from "../shell-context";

export default async function AdminSettingsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; success?: string }> }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const [settings, currencyPairs, paymentMethods, mappings, defaultThemeId, query] = await Promise.all([
    getPaymentSettingsService().list(principal),
    getNauttCatalogService().listCurrencyPairs(principal),
    getNauttCatalogService().listPaymentMethods(principal),
    getSupportedExchangeCurrencyService().listMappings(principal),
    getSystemSettingsService().getDefaultTheme(principal),
    searchParams,
  ]);

  const notice = query.success
    ? {
        tone: "success" as const,
        text: query.success === "catalog-created"
          ? dictionary.adminCatalogCreated
          : query.success === "catalog-changed"
            ? dictionary.adminCatalogChanged
            : query.success === "exchange-currency"
              ? dictionary.adminExchangeCurrencySaved
              : query.success === "theme-default"
                ? dictionary.adminThemeDefaultSaved
                : query.success === "settings"
                  ? dictionary.adminPaymentSettingsSaved
                  : dictionary.adminChanged,
      }
    : query.error
      ? {
          tone: "error" as const,
          text: query.error === "settings-failed"
            ? dictionary.adminSettingsFailed
            : query.error === "catalog-create-failed"
              ? dictionary.adminCatalogCreateFailed
              : query.error === "exchange-currency-failed"
                ? dictionary.adminExchangeCurrencyFailed
                : query.error === "theme-default-failed"
                  ? dictionary.adminThemeDefaultFailed
                  : dictionary.adminCatalogChangeFailed,
        }
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
      settings={settings}
    />
  );
}

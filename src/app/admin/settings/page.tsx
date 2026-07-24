import { AdminSettingsSurface } from "@/app/admin/admin-surface";
import { getNauttCatalogService } from "@/auth/nautt-catalog";
import { getPaymentSettingsService } from "@/auth/payment-settings";

import { requireAdminShellContext } from "../shell-context";

export default async function AdminSettingsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; success?: string }> }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const [settings, currencyPairs, paymentMethods, query] = await Promise.all([
    getPaymentSettingsService().list(principal),
    getNauttCatalogService().listCurrencyPairs(principal),
    getNauttCatalogService().listPaymentMethods(principal),
    searchParams,
  ]);
  const notice = query.success
    ? {
        tone: "success" as const,
        text: query.success === "catalog-created"
          ? dictionary.adminCatalogCreated
          : query.success === "catalog-changed"
            ? dictionary.adminCatalogChanged
            : dictionary.adminChanged,
      }
    : query.error
      ? {
          tone: "error" as const,
          text: query.error === "settings-failed"
            ? dictionary.adminSettingsFailed
            : query.error === "catalog-create-failed"
              ? dictionary.adminCatalogCreateFailed
              : dictionary.adminCatalogChangeFailed,
        }
      : null;

  return (
    <AdminSettingsSurface
      currencyPairs={currencyPairs}
      dictionary={dictionary}
      locale={locale}
      notice={notice}
      paymentMethods={paymentMethods}
      settings={settings}
    />
  );
}

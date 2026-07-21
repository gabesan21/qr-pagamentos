import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminSurface } from "@/app/admin/admin-surface";
import { ForbiddenError, UnauthenticatedError, getAuthorizationService } from "@/auth/authorization";
import { getAdministrationService } from "@/auth/administration";
import { getPaymentSettingsService } from "@/auth/payment-settings";
import { getNauttCatalogService } from "@/auth/nautt-catalog";
import { getProductService } from "@/auth/product";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";

export default async function AdminPage({ searchParams }: Readonly<{ searchParams: Promise<{ error?: string; success?: string }> }>) {
  let actor;
  try {
    actor = await getAuthorizationService().requireAdmin((await cookies()).get("qr_session")?.value);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/");
    if (error instanceof UnauthenticatedError) redirect("/login");
    throw error;
  }
  const [locale, users, settings, currencyPairs, paymentMethods, products, query] = await Promise.all([
    getLocalePreferenceService().resolve(actor.id),
    getAdministrationService().listUsers(actor),
    getPaymentSettingsService().list(actor),
    getNauttCatalogService().listCurrencyPairs(actor),
    getNauttCatalogService().listPaymentMethods(actor),
    getProductService().list(actor),
    searchParams,
  ]);
  const dictionary = getDictionary(locale);
  const noticeTone = query.success ? "success" : query.error ? "error" : null;
  const noticeText = query.success === "created" ? dictionary.adminCreated
    : query.success?.startsWith("product-") ? dictionary.adminProductChanged
    : query.success === "catalog-created" ? dictionary.adminCatalogCreated
    : query.success === "catalog-changed" ? dictionary.adminCatalogChanged
    : query.success ? dictionary.adminChanged
    : query.error === "create-failed" ? dictionary.adminCreateFailed
    : query.error === "settings-failed" ? dictionary.adminSettingsFailed
    : query.error === "catalog-create-failed" ? dictionary.adminCatalogCreateFailed
    : query.error === "catalog-change-failed" ? dictionary.adminCatalogChangeFailed
    : query.error === "product-conflict" ? dictionary.adminProductConflict
    : query.error === "product-mutation-failed" ? dictionary.adminProductMutationFailed
    : dictionary.adminChangeFailed;

  return <AdminSurface actorUsername={actor.username} currencyPairs={currencyPairs} dictionary={dictionary} locale={locale} notice={noticeTone ? { tone: noticeTone, text: noticeText } : null} paymentMethods={paymentMethods} products={products} settings={settings} users={users} />;
}

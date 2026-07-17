import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminSurface } from "@/app/admin/admin-surface";
import { ForbiddenError, getAuthorizationService } from "@/auth/authorization";
import { getAdministrationService } from "@/auth/administration";
import { getPaymentSettingsService } from "@/auth/payment-settings";
import { getDictionary } from "@/i18n/dictionaries";
import { getLocalePreferenceService } from "@/i18n/locale-preference";

export default async function AdminPage({ searchParams }: Readonly<{ searchParams: Promise<{ error?: string; success?: string }> }>) {
  let actor;
  try {
    actor = await getAuthorizationService().requireAdmin((await cookies()).get("qr_session")?.value);
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/");
    redirect("/login");
  }
  const [locale, users, settings, query] = await Promise.all([
    getLocalePreferenceService().resolve(actor.id),
    getAdministrationService().listUsers(actor),
    getPaymentSettingsService().list(actor),
    searchParams,
  ]);
  const dictionary = getDictionary(locale);
  const noticeTone = query.success ? "success" : query.error ? "error" : null;
  const noticeText = query.success === "created" ? dictionary.adminCreated : query.success ? dictionary.adminChanged : query.error === "create-failed" ? dictionary.adminCreateFailed : query.error === "settings-failed" ? dictionary.adminSettingsFailed : dictionary.adminChangeFailed;

  return <AdminSurface actorUsername={actor.username} dictionary={dictionary} locale={locale} notice={noticeTone ? { tone: noticeTone, text: noticeText } : null} settings={settings} users={users} />;
}

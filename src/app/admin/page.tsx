import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import type { Principal } from "@/auth/authorization";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAdminAnalyticsService, type AdminAnalyticsView } from "@/orders/admin-analytics";

import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

import { AdminDashboard, AdminDashboardPeriodNavigation } from "./dashboard";
import { requireAdminShellContext } from "./shell-context";

// The period controls emit only the closed set; an absent or hand-edited value
// renders the pinned default, exactly like the service's invalid-period kind.
const DEFAULT_PERIOD = "7d";

async function readDashboardView(principal: Principal, period: unknown): Promise<AdminAnalyticsView> {
  const service = getAdminAnalyticsService();
  const result = await service.getGlobal(principal, period);
  if (result.kind === "ready") return result.view;
  const fallback = await service.getGlobal(principal, DEFAULT_PERIOD);
  if (fallback.kind === "ready") return fallback.view;
  throw new Error("Administrator analytics rejected the pinned default period");
}

export default async function AdminPage({
  searchParams = Promise.resolve({}),
}: Readonly<{ searchParams?: Promise<{ error?: string; period?: string; success?: string }> }> = {}) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const query = await searchParams;
  const view = await readDashboardView(principal, query.period);
  const succeeded = Boolean(query.success);
  const failed = Boolean(query.error);
  const noticeText = query.success === "created" ? dictionary.adminCreated
    : query.success === "catalog-created" ? dictionary.adminCatalogCreated
    : query.success === "catalog-changed" ? dictionary.adminCatalogChanged
    : succeeded ? dictionary.adminChanged
    : query.error === "create-failed" ? dictionary.adminCreateFailed
    : query.error === "settings-failed" ? dictionary.adminSettingsFailed
    : query.error === "catalog-create-failed" ? dictionary.adminCatalogCreateFailed
    : query.error === "catalog-change-failed" ? dictionary.adminCatalogChangeFailed
    : dictionary.adminChangeFailed;
  const noticeEntry: NoticeToastEntry | undefined = succeeded
    ? { param: "success", value: query.success ?? "", kind: "success", message: noticeText }
    : failed
      ? { param: "error", value: query.error ?? "", kind: "error", message: noticeText }
      : undefined;

  return (
    <>
      <div className="admin-dashboard__header">
        <WorkspaceHeading
          description={dictionary.shellAdminDashboardDescription}
          eyebrow={dictionary.shellAdminEyebrow}
          title={dictionary.shellAdminDashboardTitle}
        />
        <AdminDashboardPeriodNavigation current={view.period.id} dictionary={dictionary} />
      </div>
      {noticeEntry ? <NoticeToast notices={[noticeEntry]} /> : null}
      {succeeded || failed ? (
        <noscript>
          <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "success"}>
            <AlertTitle>{failed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
            <AlertDescription>{noticeText}</AlertDescription>
          </Alert>
        </noscript>
      ) : null}
      <AdminDashboard dictionary={dictionary} locale={locale} view={view} />
    </>
  );
}

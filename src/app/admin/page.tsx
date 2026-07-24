import { EmptyWorkspace } from "@/app-shell/empty-workspace";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { requireAdminShellContext } from "./shell-context";

export default async function AdminPage({
  searchParams = Promise.resolve({}),
}: Readonly<{ searchParams?: Promise<{ error?: string; success?: string }> }> = {}) {
  const { dictionary } = await requireAdminShellContext();
  const query = await searchParams;
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

  return (
    <>
      <WorkspaceHeading
        description={dictionary.shellAdminDashboardDescription}
        eyebrow={dictionary.shellAdminEyebrow}
        title={dictionary.shellAdminDashboardTitle}
      />
      {succeeded || failed ? (
        <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "success"}>
          <AlertTitle>{failed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
          <AlertDescription>{noticeText}</AlertDescription>
        </Alert>
      ) : null}
      <EmptyWorkspace
        description={dictionary.shellWorkspaceEmptyDescription}
        title={dictionary.shellWorkspaceEmptyTitle}
      />
    </>
  );
}

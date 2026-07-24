import { EmptyWorkspace } from "@/app-shell/empty-workspace";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { requireMerchantShellContext } from "./shell-context";

export default async function MerchantDashboardPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<{
    "checkout-policy"?: string;
    "payment-links"?: string;
    language?: string;
    products?: string;
    storefront?: string;
  }>;
}> = {}) {
  const { dictionary } = await requireMerchantShellContext();
  const notices = await searchParams;
  const ownerNotice = notices.products ?? notices["payment-links"] ?? notices["checkout-policy"] ?? notices.storefront;
  const failed = ownerNotice === "failed" || ownerNotice === "conflict";

  return (
    <>
      <WorkspaceHeading
        description={dictionary.shellMerchantDashboardDescription}
        eyebrow={dictionary.shellMerchantEyebrow}
        title={dictionary.shellMerchantDashboardTitle}
      />
      {ownerNotice ? (
        <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "success"}>
          <AlertTitle>{failed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
          <AlertDescription>{failed ? dictionary.ownerSettingsFailed : dictionary.ownerSettingsUpdated}</AlertDescription>
        </Alert>
      ) : null}
      {notices.language === "saved" ? <Alert role="status" variant="success"><AlertTitle>{dictionary.languageHeading}</AlertTitle><AlertDescription>{dictionary.languageSaved}</AlertDescription></Alert> : null}
      {notices.language === "error" ? <Alert variant="destructive"><AlertTitle>{dictionary.languageHeading}</AlertTitle><AlertDescription>{dictionary.languageError}</AlertDescription></Alert> : null}
      <EmptyWorkspace
        description={dictionary.shellWorkspaceEmptyDescription}
        title={dictionary.shellWorkspaceEmptyTitle}
      />
    </>
  );
}

import { EmptyWorkspace } from "@/app-shell/empty-workspace";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";

import { requireAdminShellContext } from "../shell-context";

export default async function AdminPaymentLinksPage() {
  const { dictionary } = await requireAdminShellContext();

  return (
    <>
      <WorkspaceHeading
        description={dictionary.shellAdminLinksDescription}
        eyebrow={dictionary.shellAdminEyebrow}
        title={dictionary.shellAdminLinksTitle}
      />
      <EmptyWorkspace
        description={dictionary.shellWorkspaceEmptyDescription}
        title={dictionary.shellWorkspaceEmptyTitle}
      />
    </>
  );
}

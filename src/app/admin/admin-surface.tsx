import type { ReactNode } from "react";

import { CreateAccountModal } from "@/app/admin/accounts/create-account-modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";
import type { getDictionary } from "@/i18n/dictionaries";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";

type Dictionary = ReturnType<typeof getDictionary>;
type Notice = Readonly<{ tone: "success" | "error"; value: string; text: string }> | null;

// The accounts workspace is the header (heading plus the single "Create
// account" modal trigger), the notice bridge, and the administrator-global
// user directory composed by the page as children. The legacy inline
// mutation forms retired from this page (10.3.3 re-houses them in the
// profile editor) while their routes stay byte-frozen.
export function AdminAccountsSurface({
  children,
  dictionary,
  notice,
}: Readonly<{ children: ReactNode; dictionary: Dictionary; notice: Notice }>) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WorkspaceHeading
          description={dictionary.adminIntroduction}
          eyebrow={dictionary.shellAdminEyebrow}
          title={dictionary.adminUsersHeading}
        />
        <CreateAccountModal dictionary={dictionary} />
      </div>
      {notice ? <AccountsNotice dictionary={dictionary} notice={notice} /> : null}
      {children}
    </>
  );
}

// Toast plus the same `<noscript>` Alert fallback (the `orders-notices.tsx`
// bridge pattern): the visible always-rendered top `Alert` retires in favor
// of the one-shot toast the resolved notice already carries.
function AccountsNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: Exclude<Notice, null> }>) {
  const success = notice.tone === "success";
  const entry: NoticeToastEntry = { param: notice.tone, value: notice.value, kind: notice.tone, message: notice.text };
  return (
    <>
      <NoticeToast notices={[entry]} />
      <noscript>
        <Alert role={success ? "status" : "alert"} variant={success ? "success" : "destructive"}>
          <AlertTitle>{success ? dictionary.adminSuccessHeading : dictionary.adminErrorHeading}</AlertTitle>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      </noscript>
    </>
  );
}

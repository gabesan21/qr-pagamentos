import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

import type { Dictionary } from "./settings-surface";

// A per-section outcome the server page already resolved from its own query
// string (one `success=<value>` / `error=<value>` pair per mutation route
// this hub composes). `toastEntries` name every `param`/`value` this section
// owns so `NoticeToast` can raise the matching toast client-side; `notice` is
// the same resolved outcome rendered inside `<noscript>` for JS-disabled
// callers, since `NoticeToast` depends on `useSearchParams` hydration.
export type SectionNotice = Readonly<{ tone: "success" | "error"; text: string }> | null;

export function SettingsSectionNotice({
  dictionary,
  notice,
  toastEntries,
}: Readonly<{ dictionary: Dictionary; notice: SectionNotice; toastEntries: readonly NoticeToastEntry[] }>) {
  return (
    <>
      <NoticeToast notices={toastEntries} />
      {notice ? (
        <noscript>
          <Alert
            role={notice.tone === "success" ? "status" : "alert"}
            variant={notice.tone === "success" ? "success" : "destructive"}
          >
            {notice.tone === "success" ? <CircleCheckIcon aria-hidden="true" /> : <TriangleAlertIcon aria-hidden="true" />}
            <AlertTitle>{notice.tone === "success" ? dictionary.adminSuccessHeading : dictionary.adminErrorHeading}</AlertTitle>
            <AlertDescription>{notice.text}</AlertDescription>
          </Alert>
        </noscript>
      ) : null}
    </>
  );
}

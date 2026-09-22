import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { getDictionary } from "@/i18n/dictionaries";

import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

import { LINKS_NOTICE_KEY, type LinksNotice } from "./directory-query";

type Dictionary = ReturnType<typeof getDictionary>;

function linkOutcome(dictionary: Dictionary, notice: LinksNotice): { failed: boolean; description: string } {
  if (notice === "failed") return { failed: true, description: dictionary.paymentLinkNoticeFailed };
  const description = notice === "created"
    ? dictionary.paymentLinkNoticeCreated
    : notice === "edited"
      ? dictionary.paymentLinkNoticeEdited
      : notice === "activated"
        ? dictionary.paymentLinkNoticeActivated
        : dictionary.paymentLinkNoticeDeactivated;
  return { failed: false, description };
}

// Closed outcome banners for the `/links?payment-links-v2=<outcome>` redirects;
// the failed outcome stays the single opaque failure of the mutation routes.
export function PaymentLinkV2Notice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: LinksNotice }>) {
  const { failed, description } = linkOutcome(dictionary, notice);
  const entry: NoticeToastEntry = { param: LINKS_NOTICE_KEY, value: notice, kind: failed ? "error" : "success", message: description };
  return (
    <>
      <NoticeToast notices={[entry]} />
      <noscript>
        <Alert role={failed ? "alert" : "status"} variant={failed ? "destructive" : "success"}>
          <AlertTitle>{failed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </Alert>
      </noscript>
    </>
  );
}

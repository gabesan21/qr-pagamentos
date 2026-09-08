import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { getDictionary } from "@/i18n/dictionaries";

import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

import { LEGACY_LINKS_NOTICE_KEY, LINKS_NOTICE_KEY, type LegacyLinksNotice, type LinksNotice } from "./directory-query";

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

function legacyLinkOutcome(dictionary: Dictionary, notice: LegacyLinksNotice): { failed: boolean; description: string } {
  if (notice === "failed") return { failed: true, description: dictionary.paymentLinkNoticeFailed };
  return { failed: false, description: notice === "created" ? dictionary.paymentLinkNoticeCreated : dictionary.paymentLinkNoticeRevoked };
}

// Closed outcome banner for the frozen V1 `/links?payment-links=<outcome>`
// redirects; reuses the V2 create/failed copy and adds only the one outcome
// V2 has no equivalent for.
export function PaymentLinkLegacyNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: LegacyLinksNotice }>) {
  const { failed, description } = legacyLinkOutcome(dictionary, notice);
  const entry: NoticeToastEntry = { param: LEGACY_LINKS_NOTICE_KEY, value: notice, kind: failed ? "error" : "success", message: description };
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

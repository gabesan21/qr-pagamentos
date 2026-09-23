import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { getDictionary } from "@/i18n/dictionaries";

import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

import { ORDERS_NOTICE_KEY, type OrdersNotice } from "./directory-query";

type Dictionary = ReturnType<typeof getDictionary>;

function orderOutcome(dictionary: Dictionary, notice: OrdersNotice): { failed: boolean; description: string } {
  if (notice === "failed") return { failed: true, description: dictionary.orderV2NoticeFailed };
  const description = notice === "commented"
    ? dictionary.orderV2NoticeCommented
    : notice === "comment-edited"
      ? dictionary.orderV2NoticeCommentEdited
      : dictionary.orderV2NoticeOutcomeSet;
  return { failed: false, description };
}

// Closed outcome banners for the `/orders?orders-v2=<outcome>` redirects; the
// failed outcome stays the single opaque failure of the mutation routes.
export function OrderV2Notice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: OrdersNotice }>) {
  const { failed, description } = orderOutcome(dictionary, notice);
  const entry: NoticeToastEntry = { param: ORDERS_NOTICE_KEY, value: notice, kind: failed ? "error" : "success", message: description };
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

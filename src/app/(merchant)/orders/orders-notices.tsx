import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { getDictionary } from "@/i18n/dictionaries";

import type { OrdersNotice } from "./directory-query";

type Dictionary = ReturnType<typeof getDictionary>;

// Closed outcome banners for the `/orders?orders-v2=<outcome>` redirects; the
// failed outcome stays the single opaque failure of the mutation routes.
export function OrderV2Notice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: OrdersNotice }>) {
  if (notice === "failed") {
    return (
      <Alert role="alert" variant="destructive">
        <AlertTitle>{dictionary.adminErrorHeading}</AlertTitle>
        <AlertDescription>{dictionary.orderV2NoticeFailed}</AlertDescription>
      </Alert>
    );
  }
  const description = notice === "commented"
    ? dictionary.orderV2NoticeCommented
    : notice === "comment-edited"
      ? dictionary.orderV2NoticeCommentEdited
      : dictionary.orderV2NoticeOutcomeSet;
  return (
    <Alert role="status" variant="success">
      <AlertTitle>{dictionary.adminSuccessHeading}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { getDictionary } from "@/i18n/dictionaries";

import type { LinksNotice } from "./directory-query";

type Dictionary = ReturnType<typeof getDictionary>;

// Closed outcome banners for the `/links?payment-links-v2=<outcome>` redirects;
// the failed outcome stays the single opaque failure of the mutation routes.
export function PaymentLinkV2Notice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: LinksNotice }>) {
  if (notice === "failed") {
    return (
      <Alert role="alert" variant="destructive">
        <AlertTitle>{dictionary.adminErrorHeading}</AlertTitle>
        <AlertDescription>{dictionary.paymentLinkNoticeFailed}</AlertDescription>
      </Alert>
    );
  }
  const description = notice === "created"
    ? dictionary.paymentLinkNoticeCreated
    : notice === "edited"
      ? dictionary.paymentLinkNoticeEdited
      : notice === "activated"
        ? dictionary.paymentLinkNoticeActivated
        : dictionary.paymentLinkNoticeDeactivated;
  return (
    <Alert role="status" variant="success">
      <AlertTitle>{dictionary.adminSuccessHeading}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}

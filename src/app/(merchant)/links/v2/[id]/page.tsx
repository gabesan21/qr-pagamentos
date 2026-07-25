import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getPaymentLinkV2ViewService } from "@/auth/payment-link-v2-view";

import { requireMerchantShellContext } from "../../../shell-context";
import { PaymentLinkV2DetailCard, PaymentLinkV2UnavailableCard } from "../../link-v2-views";

export default async function PaymentLinkV2DetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const result = await getPaymentLinkV2ViewService().getForOwner(principal, (await params).id);

  return (
    <>
      <WorkspaceHeading description={dictionary.paymentLinkDirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellLinks} />
      {result.kind === "found"
        ? <PaymentLinkV2DetailCard backHref="/links" dictionary={dictionary} link={result.link} locale={locale} />
        : <PaymentLinkV2UnavailableCard backHref="/links" dictionary={dictionary} />}
    </>
  );
}

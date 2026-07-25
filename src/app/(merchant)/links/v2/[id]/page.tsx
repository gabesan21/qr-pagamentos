import Link from "next/link";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getPaymentLinkV2PrefillService } from "@/auth/payment-link-v2-prefill";
import { getPaymentLinkV2ViewService } from "@/auth/payment-link-v2-view";
import { Button } from "@/components/ui/button";

import { requireMerchantShellContext } from "../../../shell-context";
import { PaymentLinkV2LifecycleCard } from "../../link-v2-actions";
import { PaymentLinkV2DetailCard, PaymentLinkV2UnavailableCard } from "../../link-v2-views";

export default async function PaymentLinkV2DetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const id = (await params).id;
  const [result, prefill] = await Promise.all([
    getPaymentLinkV2ViewService().getForOwner(principal, id),
    getPaymentLinkV2PrefillService().getForOwner(principal, id),
  ]);

  return (
    <>
      <WorkspaceHeading description={dictionary.paymentLinkDirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellLinks} />
      {result.kind === "found" && prefill !== null
        ? (
          <>
            <PaymentLinkV2DetailCard backHref="/links" dictionary={dictionary} link={result.link} locale={locale} />
            <div className="flex flex-wrap gap-3">
              <Button asChild data-ds-hit-target>
                <Link href={`/links/v2/${result.link.id}/edit`}>{dictionary.paymentLinkEditAction}</Link>
              </Button>
              <Button asChild data-ds-hit-target variant="outline">
                <Link href={`/links/v2/${result.link.id}/orders`}>{dictionary.paymentLinkOrdersView}</Link>
              </Button>
            </div>
            <PaymentLinkV2LifecycleCard active={result.link.active} dictionary={dictionary} id={result.link.id} version={prefill.version} />
          </>
        )
        : <PaymentLinkV2UnavailableCard backHref="/links" dictionary={dictionary} />}
    </>
  );
}

import Link from "next/link";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getPaymentLinkV2PrefillService } from "@/auth/payment-link-v2-prefill";
import { getPaymentLinkV2ViewService } from "@/auth/payment-link-v2-view";
import { Button } from "@/components/ui/button";
import { ExternalLinkIcon, GitBranchIcon, ListOrderedIcon, PencilIcon } from "lucide-react";

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

  if (result.kind !== "found" || prefill === null) {
    return (
      <>
        <WorkspaceHeading description={dictionary.paymentLinkDirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellLinks} />
        <PaymentLinkV2UnavailableCard backHref="/links" dictionary={dictionary} />
      </>
    );
  }

  const link = result.link;
  const payUrl = link.sharePath;

  return (
    <div className="space-y-4">
      <WorkspaceHeading description={dictionary.paymentLinkDirectoryDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellLinks} />

      <PaymentLinkV2DetailCard
        backHref="/links"
        backLabel={dictionary.paymentLinkDirectoryBack}
        dictionary={dictionary}
        link={link}
        locale={locale}
        orders={{ total: link.orderCount, confirmed: 0, volume: "0.00" }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild data-ds-hit-target size="sm" variant="outline">
          <a href={payUrl} rel="noopener" target="_blank"><ExternalLinkIcon aria-hidden /> {dictionary.paymentLinkDirectoryShareOpen}</a>
        </Button>
        <Button asChild data-ds-hit-target size="sm" variant="outline">
          <Link href={`/links/v2/${link.id}/edit`}><PencilIcon aria-hidden /> {dictionary.paymentLinkEditAction}</Link>
        </Button>
        <Button asChild data-ds-hit-target size="sm" variant="outline">
          <Link href={`/links/new?from=${link.id}`}><GitBranchIcon aria-hidden /> {dictionary.paymentLinkNewVersion}</Link>
        </Button>
        <Button asChild data-ds-hit-target size="sm" variant="outline">
          <Link href={`/links/v2/${link.id}/orders`}><ListOrderedIcon aria-hidden /> {dictionary.paymentLinkOrdersView}</Link>
        </Button>
      </div>

      <PaymentLinkV2LifecycleCard active={link.active} dictionary={dictionary} id={link.id} version={prefill.version} />
    </div>
  );
}

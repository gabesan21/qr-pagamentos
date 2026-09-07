import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import {
  PaymentLinkV2DetailCard,
  PaymentLinkV2UnavailableCard,
} from "@/app/(merchant)/links/link-v2-views";
import { Button } from "@/components/ui/button";
import { getAdminPaymentLinkV2DirectoryService } from "@/auth/payment-link-v2-admin-directory";
import Link from "next/link";

import { requireAdminShellContext } from "../../../shell-context";

// The read-only administrator V2 payment-link detail: one bounded global read
// with owner attribution, the redacted composition facts, and the drill-down
// into the administrator orders directory filtered by this link's identifier.
// Owner-only surfaces (edit/activate/deactivate forms) never render.
export default async function AdminPaymentLinkV2DetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { dictionary, locale, principal } = await requireAdminShellContext();
  const id = (await params).id;
  const result = await getAdminPaymentLinkV2DirectoryService().getForAdmin(principal, id);

  return (
    <>
      <WorkspaceHeading description={dictionary.adminPaymentLinkV2DirectoryDescription} eyebrow={dictionary.shellAdminEyebrow} title={dictionary.shellAdminLinksTitle} />
      {result.kind === "found"
        ? (
          <div className="space-y-4">
            <PaymentLinkV2DetailCard
              backHref="/admin/payment-links"
              backLabel={dictionary.paymentLinkDirectoryBack}
              dictionary={dictionary}
              link={result.link}
              locale={locale}
              owner={result.link.owner}
              showShareUrl={false}
            />
            <Button asChild data-ds-hit-target variant="outline">
              <Link href={`/admin/orders?filter.link=${encodeURIComponent(result.link.identifier)}`}>{dictionary.paymentLinkOrdersView}</Link>
            </Button>
          </div>
        )
        : <PaymentLinkV2UnavailableCard backHref="/admin/payment-links" dictionary={dictionary} />}
    </>
  );
}

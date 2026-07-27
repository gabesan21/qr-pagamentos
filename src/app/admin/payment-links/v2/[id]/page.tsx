import Link from "next/link";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import {
  PaymentLinkV2DetailCard,
  PaymentLinkV2UnavailableCard,
} from "@/app/(merchant)/links/link-v2-views";
import {
  getAdminPaymentLinkV2DirectoryService,
  type AdminPaymentLinkV2Owner,
} from "@/auth/payment-link-v2-admin-directory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { getDictionary } from "@/i18n/dictionaries";

import { requireAdminShellContext } from "../../../shell-context";

type Dictionary = ReturnType<typeof getDictionary>;

// Administrator owner attribution on the read-only V2 detail: the same
// interim /admin/accounts navigation and localized deleted badge as the
// directory owner cell.
function OwnerAttributionCard({ dictionary, owner }: Readonly<{ dictionary: Dictionary; owner: AdminPaymentLinkV2Owner }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.adminPaymentLinkV2DetailOwnerHeading}</CardTitle></CardHeader>
      <CardContent>
        <p>
          {owner.username}
          {owner.deletedAt !== null ? <> <Badge variant="outline">{dictionary.adminPaymentLinkV2DirectoryOwnerDeleted}</Badge></> : null}
        </p>
        <Button asChild data-ds-hit-target variant="outline"><Link href="/admin/accounts">{dictionary.adminPaymentLinkV2DetailOwnerAccount}</Link></Button>
      </CardContent>
    </Card>
  );
}

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
          <>
            <PaymentLinkV2DetailCard backHref="/admin/payment-links" dictionary={dictionary} link={result.link} locale={locale} />
            <OwnerAttributionCard dictionary={dictionary} owner={result.link.owner} />
            <Button asChild data-ds-hit-target variant="outline">
              <Link href={`/admin/orders?link=${result.link.identifier}`}>{dictionary.paymentLinkOrdersView}</Link>
            </Button>
          </>
        )
        : <PaymentLinkV2UnavailableCard backHref="/admin/payment-links" dictionary={dictionary} />}
    </>
  );
}

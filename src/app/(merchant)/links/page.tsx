import { OwnerPaymentLinkManagement } from "@/app/admin/payment-link-management";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getPaymentLinkService } from "@/auth/payment-link";

import { requireMerchantShellContext } from "../shell-context";

export default async function MerchantLinksPage() {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const data = await getPaymentLinkService().listForOwner(principal);

  return (
    <>
      <WorkspaceHeading description={dictionary.adminPaymentLinksDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellLinks} />
      <OwnerPaymentLinkManagement data={data} dictionary={dictionary} locale={locale} />
    </>
  );
}

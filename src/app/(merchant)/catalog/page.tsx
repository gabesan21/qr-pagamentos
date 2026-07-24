import { OwnerProductManagement } from "@/app/admin/product-management";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductService } from "@/auth/product";

import { requireMerchantShellContext } from "../shell-context";

export default async function MerchantCatalogPage() {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const products = await getProductService().listForOwner(principal);

  return (
    <>
      <WorkspaceHeading description={dictionary.adminProductsDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellProducts} />
      <OwnerProductManagement dictionary={dictionary} locale={locale} products={products} />
    </>
  );
}

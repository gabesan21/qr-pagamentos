import Link from "next/link";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductCategoryService } from "@/auth/product-category";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { requireMerchantShellContext } from "../../../shell-context";
import { ProductForm } from "../../product-form";

export default async function NewProductPage() {
  const { dictionary, principal } = await requireMerchantShellContext();
  const [categories, choices] = await Promise.all([
    getProductCategoryService().listForOwner(principal),
    getSupportedExchangeCurrencyService().listActiveChoices(principal),
  ]);

  return (
    <>
      <WorkspaceHeading description={dictionary.catalogProductNewDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.catalogProductNewTitle} />
      <div className="flex flex-wrap gap-3">
        <Button asChild data-ds-hit-target variant="outline">
          <Link href="/catalog">{dictionary.catalogProductBackToCatalog}</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{dictionary.catalogProductNewTitle}</CardTitle>
          <CardDescription>{dictionary.catalogProductNewDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductForm categories={categories} choices={choices} dictionary={dictionary} formId="product-create" />
        </CardContent>
      </Card>
    </>
  );
}

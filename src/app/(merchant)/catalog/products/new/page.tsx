import Link from "next/link";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductCategoryService } from "@/auth/product-category";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { Button } from "@/components/ui/button";

import { requireMerchantShellContext } from "../../../shell-context";
import { Breadcrumb, SectionCard } from "../../catalog-fields";
import { ProductForm } from "../../product-form";

export default async function NewProductPage() {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const [categories, choices] = await Promise.all([
    getProductCategoryService().listForOwner(principal),
    getSupportedExchangeCurrencyService().listActiveChoices(principal),
  ]);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { href: "/catalog", label: dictionary.shellProducts },
          { label: dictionary.catalogProductNewTitle },
        ]}
      />
      <WorkspaceHeading
        description={dictionary.catalogProductNewDescription}
        eyebrow={dictionary.shellMerchantEyebrow}
        title={dictionary.catalogProductNewTitle}
      />
      <SectionCard description={dictionary.catalogProductNewDescription} title={dictionary.catalogProductNewTitle}>
        <ProductForm
          categories={categories}
          choices={choices}
          dictionary={dictionary}
          formId="product-create"
          locale={locale}
        />
      </SectionCard>
      <div className="flex justify-end gap-3">
        <Button asChild variant="outline">
          <Link href="/catalog">{dictionary.catalogProductBackToCatalog}</Link>
        </Button>
        <Button form="product-create" type="submit">
          {dictionary.adminProductCreate}
        </Button>
      </div>
    </div>
  );
}

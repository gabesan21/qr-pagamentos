import Link from "next/link";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductCategoryService } from "@/auth/product-category";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { Button } from "@/components/ui/button";

import { requireMerchantShellContext } from "../../../shell-context";
import { Breadcrumb, SectionCard } from "../../catalog-fields";
import { ProductNotice } from "../../catalog-notices";
import { ProductForm } from "../../product-form";

const PRODUCT_FAILURE_NOTICES = ["conflict", "failed"] as const;
type ProductFailureNotice = (typeof PRODUCT_FAILURE_NOTICES)[number];

function resolveProductNotice(value: string | string[] | undefined): ProductFailureNotice | undefined {
  return typeof value === "string" && (PRODUCT_FAILURE_NOTICES as readonly string[]).includes(value)
    ? (value as ProductFailureNotice)
    : undefined;
}

export default async function NewProductPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}> = {}) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const notice = resolveProductNotice((await searchParams).products);
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
      {notice ? <ProductNotice dictionary={dictionary} notice={notice} /> : null}
      <SectionCard title={dictionary.catalogProductNewTitle}>
        <ProductForm
          categories={categories}
          choices={choices}
          dictionary={dictionary}
          formId="product-create"
          locale={locale}
        />
      </SectionCard>
      <div className="flex justify-end">
        <Button asChild variant="outline">
          <Link href="/catalog">{dictionary.catalogProductBackToCatalog}</Link>
        </Button>
      </div>
    </div>
  );
}

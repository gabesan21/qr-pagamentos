import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductService } from "@/auth/product";
import { getProductCategoryService } from "@/auth/product-category";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { requireMerchantShellContext } from "../../../shell-context";

import { ProductDetailClient } from "./product-detail-client";

export default async function ProductDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const { id } = await params;
  let products: Awaited<ReturnType<ReturnType<typeof getProductService>["listForOwner"]>>;
  let categories: Awaited<ReturnType<ReturnType<typeof getProductCategoryService>["listForOwner"]>>;
  let choices: Awaited<ReturnType<ReturnType<typeof getSupportedExchangeCurrencyService>["listActiveChoices"]>>;
  let loadFailed = false;
  try {
    [products, categories, choices] = await Promise.all([
      getProductService().listForOwner(principal),
      getProductCategoryService().listForOwner(principal),
      getSupportedExchangeCurrencyService().listActiveChoices(principal),
    ]);
  } catch {
    products = [];
    categories = [];
    choices = [];
    loadFailed = true;
  }

  if (loadFailed) {
    return (
      <div className="space-y-6">
        <WorkspaceHeading
          description={dictionary.catalogProductsDescription}
          eyebrow={dictionary.shellMerchantEyebrow}
          title={dictionary.catalogProductUnavailable}
        />
        <Alert variant="destructive">
          <AlertTitle>{dictionary.dataDirectoryError}</AlertTitle>
          <AlertDescription>{dictionary.dataDirectoryErrorDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const product = products.find((candidate) => candidate.id === id.toLowerCase());

  return (
    <ProductDetailClient
      categories={categories}
      choices={choices}
      dictionary={dictionary}
      locale={locale}
      product={product}
    />
  );
}

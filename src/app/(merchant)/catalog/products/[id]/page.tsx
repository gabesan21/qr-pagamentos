import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductService } from "@/auth/product";
import { getProductCategoryService } from "@/auth/product-category";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { requireMerchantShellContext } from "../../../shell-context";

import { ProductDetailClient } from "./product-detail-client";

const PRODUCT_FAILURE_NOTICES = ["conflict", "failed"] as const;
type ProductFailureNotice = (typeof PRODUCT_FAILURE_NOTICES)[number];

function resolveProductNotice(value: string | string[] | undefined): ProductFailureNotice | undefined {
  return typeof value === "string" && (PRODUCT_FAILURE_NOTICES as readonly string[]).includes(value)
    ? (value as ProductFailureNotice)
    : undefined;
}

export default async function ProductDetailPage({
  params,
  searchParams = Promise.resolve({}),
}: Readonly<{
  params: Promise<{ id: string }>;
  searchParams?: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const { id } = await params;
  const notice = resolveProductNotice((await searchParams).products);
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
      notice={notice}
      product={product}
    />
  );
}

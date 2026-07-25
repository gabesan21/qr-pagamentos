import Link from "next/link";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductService, type OwnerProduct } from "@/auth/product";
import { getProductCategoryService, type OwnerProductCategory } from "@/auth/product-category";
import { getSupportedExchangeCurrencyService } from "@/auth/supported-exchange-currency";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BrandIdentity } from "@/brand/brand-identity";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { requireMerchantShellContext } from "../../../shell-context";
import { CatalogSubmit } from "../../catalog-submit";
import { formatCatalogPrice } from "../../price-format";
import { ProductForm } from "../../product-form";

type Dictionary = ReturnType<typeof getDictionary>;

function ArchivedProductView({
  category,
  dictionary,
  locale,
  product,
}: Readonly<{
  category: OwnerProductCategory | undefined;
  dictionary: Dictionary;
  locale: SupportedLocale;
  product: OwnerProduct;
}>) {
  const facts: ReadonlyArray<readonly [string, string]> = [
    [dictionary.adminProductInternalName, product.internalName],
    [dictionary.adminProductPublicPtBr, product.titlePtBr],
    [dictionary.adminProductPublicEn, product.titleEn],
    [dictionary.adminProductPrice, formatCatalogPrice(product.price, product.currencyCode, locale)],
    [dictionary.catalogProductCategoryLabel, category ? locale === "pt-BR" ? category.namePtBr : category.nameEn : dictionary.catalogProductCategoryNone],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{product.internalName}</CardTitle>
        <CardDescription>{dictionary.catalogProductEditDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          {product.imageMediaId ? (
            <img alt={dictionary.catalogProductImageAlt} className="size-28 rounded-md border border-border object-cover" height={112} src={`/media/${product.imageMediaId}`} width={112} />
          ) : (
            <span aria-hidden="true" className="flex size-28 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
              <BrandIdentity variant="merchant-fallback" />
            </span>
          )}
          <Badge variant="destructive">{dictionary.catalogProductStateArchived}</Badge>
        </div>
        <Alert variant="warning">
          <AlertTitle>{dictionary.catalogProductStateArchived}</AlertTitle>
          <AlertDescription>{dictionary.catalogProductArchivedNotice}</AlertDescription>
        </Alert>
        <dl className="grid gap-3">
          {facts.map(([label, value]) => (
            <div className="grid gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0" key={label}>
              <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
              <dd className="m-0 break-words">{value}</dd>
            </div>
          ))}
          <div className="grid gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
            <dt className="text-sm font-medium text-muted-foreground">{dictionary.adminProductDescriptionPtBr}</dt>
            <dd className="m-0 break-words whitespace-pre-line">{product.descriptionPtBr}</dd>
          </div>
          <div className="grid gap-1 border-b border-border pb-3 last:border-b-0 last:pb-0">
            <dt className="text-sm font-medium text-muted-foreground">{dictionary.adminProductDescriptionEn}</dt>
            <dd className="m-0 break-words whitespace-pre-line">{product.descriptionEn}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function ArchiveProductCard({ dictionary, product }: Readonly<{ dictionary: Dictionary; product: OwnerProduct }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.catalogProductArchiveHeading}</CardTitle>
      </CardHeader>
      <CardContent>
        <details>
          <summary>{dictionary.catalogProductArchiveConfirm}</summary>
          <Alert variant="warning">
            <AlertTitle>{dictionary.catalogProductArchiveConfirm}</AlertTitle>
            <AlertDescription>{dictionary.catalogProductArchiveDescription}</AlertDescription>
          </Alert>
          <form action="/products" method="post">
            <Input name="action" type="hidden" value="archive" />
            <Input name="id" type="hidden" value={product.id} />
            <Input name="version" type="hidden" value={product.version} />
            <CatalogSubmit label={dictionary.catalogProductArchive} tone="destructive" />
          </form>
        </details>
      </CardContent>
    </Card>
  );
}

export default async function ProductDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const { id } = await params;
  const [products, categories, choices] = await Promise.all([
    getProductService().listForOwner(principal),
    getProductCategoryService().listForOwner(principal),
    getSupportedExchangeCurrencyService().listActiveChoices(principal),
  ]);
  const product = products.find((candidate) => candidate.id === id.toLowerCase());

  return (
    <>
      <WorkspaceHeading
        description={product && product.archivedAt === null ? dictionary.catalogProductEditDescription : dictionary.catalogProductsDescription}
        eyebrow={dictionary.shellMerchantEyebrow}
        title={product ? product.archivedAt === null ? dictionary.catalogProductEditTitle : product.internalName : dictionary.catalogProductUnavailable}
      />
      <div className="flex flex-wrap gap-3">
        <Button asChild data-ds-hit-target variant="outline">
          <Link href="/catalog">{dictionary.catalogProductBackToCatalog}</Link>
        </Button>
      </div>
      {!product ? (
        <Alert variant="destructive">
          <AlertTitle>{dictionary.catalogProductUnavailable}</AlertTitle>
          <AlertDescription>{dictionary.catalogProductUnavailableDescription}</AlertDescription>
        </Alert>
      ) : product.archivedAt !== null ? (
        <ArchivedProductView
          category={categories.find((category) => category.id === product.categoryId)}
          dictionary={dictionary}
          locale={locale}
          product={product}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{dictionary.catalogProductEditTitle}</CardTitle>
              <CardDescription>{dictionary.catalogProductEditDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <ProductForm categories={categories} choices={choices} dictionary={dictionary} formId="product-edit" product={product} />
            </CardContent>
          </Card>
          <ArchiveProductCard dictionary={dictionary} product={product} />
        </>
      )}
    </>
  );
}

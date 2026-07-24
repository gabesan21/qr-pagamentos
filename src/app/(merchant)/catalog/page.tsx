import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductService, type OwnerProduct } from "@/auth/product";
import { getProductCategoryService } from "@/auth/product-category";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import { BrandIdentity } from "@/brand/brand-identity";

import { requireMerchantShellContext } from "../shell-context";
import { ProductNotice } from "./catalog-notices";
import { catalogDirectoryCopy } from "./directory-copy";
import { resolveCatalogDirectoryQuery, type CatalogSearchParams } from "./directory-query";
import { formatCatalogPrice } from "./price-format";

type Dictionary = ReturnType<typeof getDictionary>;

const PRODUCT_NOTICE_VALUES = ["create", "update", "active", "archive", "delete", "conflict", "failed"] as const;
const STATE_FILTER_VALUES = ["active", "inactive", "archived"] as const;

function productState(product: OwnerProduct): "active" | "inactive" | "archived" {
  if (product.archivedAt !== null) return "archived";
  return product.active ? "active" : "inactive";
}

function ProductThumbnail({ product }: Readonly<{ product: OwnerProduct }>) {
  if (product.imageMediaId) {
    return (
      <img alt="" className="size-12 rounded-md border border-border object-cover" height={48} src={`/media/${product.imageMediaId}`} width={48} />
    );
  }
  return (
    <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
      <BrandIdentity variant="mark-only" />
    </span>
  );
}

function stateBadge(dictionary: Dictionary, product: OwnerProduct) {
  const state = productState(product);
  if (state === "archived") return <Badge variant="destructive">{dictionary.catalogProductStateArchived}</Badge>;
  if (state === "inactive") return <Badge variant="outline">{dictionary.catalogProductStateInactive}</Badge>;
  return <Badge variant="secondary">{dictionary.catalogProductStateActive}</Badge>;
}

function matchesSearch(product: OwnerProduct, q: string | undefined) {
  if (!q) return true;
  const needle = q.toLocaleLowerCase();
  return [product.internalName, product.titlePtBr, product.titleEn]
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

function ProductDirectory({
  categories,
  dictionary,
  locale,
  products,
  query,
}: Readonly<{
  categories: readonly { id: string; namePtBr: string; nameEn: string }[];
  dictionary: Dictionary;
  locale: SupportedLocale;
  products: readonly OwnerProduct[];
  query: Extract<ReturnType<typeof resolveCatalogDirectoryQuery>, { status: "ready" | "invalid-query" }>;
}>) {
  const categoryNames = new Map(categories.map((category) => [category.id, locale === "pt-BR" ? category.namePtBr : category.nameEn]));
  const columns: readonly DataDirectoryColumn<OwnerProduct>[] = [
    { id: "image", label: dictionary.catalogProductImageColumn, value: (row) => <ProductThumbnail product={row} /> },
    { id: "internalName", label: dictionary.adminProductInternalName, value: (row) => row.internalName },
    { id: "title", label: dictionary.catalogProductTitleColumn, value: (row) => locale === "pt-BR" ? row.titlePtBr : row.titleEn },
    { id: "price", label: dictionary.adminProductPrice, numeric: true, value: (row) => formatCatalogPrice(row.price, row.currencyCode, locale) },
    { id: "category", label: dictionary.catalogProductCategoryColumn, value: (row) => row.categoryId ? categoryNames.get(row.categoryId) ?? dictionary.catalogProductCategoryNone : dictionary.catalogProductCategoryNone },
    { id: "state", label: dictionary.catalogProductStateColumn, value: (row) => stateBadge(dictionary, row) },
  ];

  if (query.status === "invalid-query") {
    return (
      <DataDirectory
        caption={dictionary.shellProducts}
        columns={columns}
        copy={catalogDirectoryCopy(dictionary, { title: dictionary.catalogProductsEmpty, description: dictionary.catalogProductsEmptyDescription })}
        formAction="/catalog"
        idPrefix="catalog-products"
        resetUrl="/catalog"
        rowKey={(row) => row.id}
        rows={[]}
        state="invalid-query"
      />
    );
  }

  const stateFilter = typeof query.filters.state === "string" ? query.filters.state : query.filters.state?.[0];
  const categoryFilter = typeof query.filters.category === "string" ? [query.filters.category] : query.filters.category;
  const filtered = products.filter((product) =>
    matchesSearch(product, query.q)
    && (!stateFilter || productState(product) === stateFilter)
    && (!categoryFilter || (product.categoryId !== null && categoryFilter.includes(product.categoryId))));
  const filtering = Boolean(query.q) || Boolean(stateFilter) || Boolean(categoryFilter);
  const state: DataDirectoryState = products.length === 0 && !filtering
    ? "empty"
    : filtered.length === 0
      ? "filtered-empty"
      : "ready";
  const truncated = filtered.length > query.pageSize;
  const rows = truncated ? filtered.slice(0, query.pageSize) : filtered;

  return (
    <>
      <DataDirectory
        actionsLabel={dictionary.catalogProductActionsColumn}
        caption={dictionary.shellProducts}
        columns={columns}
        copy={catalogDirectoryCopy(dictionary, { title: dictionary.catalogProductsEmpty, description: dictionary.catalogProductsEmptyDescription })}
        emptyAction={{ href: "/catalog/products/new", label: dictionary.adminProductCreate }}
        filters={[
          {
            name: "state",
            label: dictionary.catalogProductFilterState,
            allLabel: dictionary.catalogProductFilterAllStates,
            ...(stateFilter ? { selected: stateFilter } : {}),
            options: STATE_FILTER_VALUES.map((value) => ({
              value,
              label: value === "active" ? dictionary.catalogProductStateActive : value === "inactive" ? dictionary.catalogProductStateInactive : dictionary.catalogProductStateArchived,
            })),
          },
          ...(categories.length > 0
            ? [{
              name: "category",
              label: dictionary.catalogProductFilterCategory,
              allLabel: dictionary.catalogProductFilterAllCategories,
              ...(categoryFilter?.[0] ? { selected: categoryFilter[0] } : {}),
              options: categories.map((category) => ({ value: category.id, label: locale === "pt-BR" ? category.namePtBr : category.nameEn })),
            }]
            : []),
        ]}
        formAction="/catalog"
        getRowActions={(row) => (
          <Button asChild data-ds-hit-target variant="outline">
            <Link href={`/catalog/products/${row.id}`}>{row.archivedAt !== null ? dictionary.catalogProductView : dictionary.catalogProductEdit}</Link>
          </Button>
        )}
        idPrefix="catalog-products"
        pageSize={query.pageSize}
        resetUrl="/catalog"
        retryUrl="/catalog"
        rowKey={(row) => row.id}
        rows={rows}
        {...(query.q ? { search: query.q } : {})}
        state={state}
      />
      {truncated ? <p className="text-sm text-muted-foreground">{dictionary.catalogProductsTruncated}</p> : null}
    </>
  );
}

export default async function MerchantCatalogPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<CatalogSearchParams>;
}> = {}) {
  const { dictionary, locale, principal } = await requireMerchantShellContext();
  const params = await searchParams;
  let products: readonly OwnerProduct[];
  let categories: readonly { id: string; namePtBr: string; nameEn: string; active: boolean }[];
  let loadFailed = false;
  try {
    [products, categories] = await Promise.all([
      getProductService().listForOwner(principal),
      getProductCategoryService().listForOwner(principal),
    ]);
  } catch {
    products = [];
    categories = [];
    loadFailed = true;
  }

  const query = resolveCatalogDirectoryQuery({
    path: "/catalog",
    searchParams: params,
    definitions: [
      { name: "state", kind: "enum", values: STATE_FILTER_VALUES },
      // Enum filters require at least one registered value; without any
      // category the filter does not exist and its key is invalid input.
      ...(categories.length > 0 ? [{ name: "category", kind: "enum", values: categories.map((category) => category.id) } as const] : []),
    ],
    noticeKey: "products",
    noticeValues: PRODUCT_NOTICE_VALUES,
  });
  if (query.status === "redirect") redirect(query.location);

  return (
    <>
      <WorkspaceHeading description={dictionary.catalogProductsDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.shellProducts} />
      {query.status === "ready" && query.notice ? <ProductNotice dictionary={dictionary} notice={query.notice} /> : null}
      <div className="flex flex-wrap gap-3">
        <Button asChild data-ds-hit-target>
          <Link href="/catalog/products/new">{dictionary.adminProductCreate}</Link>
        </Button>
        <Button asChild data-ds-hit-target variant="outline">
          <Link href="/catalog/categories">{dictionary.catalogCategoriesTitle}</Link>
        </Button>
      </div>
      {loadFailed ? (
        <DataDirectory
          caption={dictionary.shellProducts}
          columns={[]}
          copy={catalogDirectoryCopy(dictionary, { title: dictionary.catalogProductsEmpty, description: dictionary.catalogProductsEmptyDescription })}
          formAction="/catalog"
          idPrefix="catalog-products"
          resetUrl="/catalog"
          retryUrl="/catalog"
          rowKey={() => "none"}
          rows={[]}
          state="error"
        />
      ) : (
        <ProductDirectory categories={categories} dictionary={dictionary} locale={locale} products={products} query={query} />
      )}
    </>
  );
}

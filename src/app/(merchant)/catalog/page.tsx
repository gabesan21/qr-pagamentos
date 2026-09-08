import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { dataDirectoryCopy, DirectoryInvalidFiltersNotice } from "@/app/directory-support";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductService, type OwnerProduct } from "@/auth/product";
import { getProductCategoryService } from "@/auth/product-category";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DIRECTORY_INVALID_FILTERS_PARAM,
  DIRECTORY_INVALID_FILTERS_VALUE,
  directoryInvalidFiltersLocation,
} from "@/data-directory/server/notice";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import { MoneyText } from "@/components/ui/money-text";
import { StatusBadge } from "@/components/ui/status-badge";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import { BrandIdentity } from "@/brand/brand-identity";

import { requireMerchantShellContext } from "../shell-context";
import { ProductNotice } from "./catalog-notices";
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
      <img
        alt=""
        className="size-10 rounded-md border border-border object-cover"
        height={40}
        src={`/media/${product.imageMediaId}`}
        width={40}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-10 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground"
    >
      <BrandIdentity variant="mark-only" />
    </span>
  );
}

function ProductTitle({
  dictionary,
  locale,
  product,
}: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; product: OwnerProduct }>) {
  const title = locale === "pt-BR" ? product.titlePtBr : product.titleEn;
  const other = locale === "pt-BR" ? product.titleEn : product.titlePtBr;
  return (
    <span className="block">
      <span className="block">{title}</span>
      {other ? <span className="block text-xs text-muted-foreground">{other}</span> : null}
    </span>
  );
}

function ProductStateBadge({ dictionary, product }: Readonly<{ dictionary: Dictionary; product: OwnerProduct }>) {
  const state = productState(product);
  if (state === "archived") {
    return <StatusBadge archived label={dictionary.catalogProductStateArchived} tone="danger" />;
  }
  if (state === "inactive") {
    return <StatusBadge label={dictionary.catalogProductStateInactive} tone="neutral" />;
  }
  return <StatusBadge label={dictionary.catalogProductStateActive} tone="success" />;
}

function CategoryPill({
  categoryId,
  categoryNames,
  noneLabel,
}: Readonly<{ categoryId: string | null; categoryNames: Map<string, string>; noneLabel: string }>) {
  if (!categoryId) return <span className="text-muted-foreground">{noneLabel}</span>;
  const name = categoryNames.get(categoryId);
  if (!name) return <span className="text-muted-foreground">{noneLabel}</span>;
  return <Badge variant="secondary">{name}</Badge>;
}

function matchesSearch(product: OwnerProduct, q: string | undefined) {
  if (!q) return true;
  const needle = q.toLocaleLowerCase();
  return [product.internalName, product.titlePtBr, product.titleEn].some((value) =>
    value.toLocaleLowerCase().includes(needle),
  );
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
  query: Extract<ReturnType<typeof resolveCatalogDirectoryQuery>, { status: "ready" }>;
}>) {
  const categoryNames = new Map(
    categories.map((category) => [category.id, locale === "pt-BR" ? category.namePtBr : category.nameEn]),
  );
  const columns: readonly DataDirectoryColumn<OwnerProduct>[] = [
    { id: "image", label: dictionary.catalogProductImageColumn, value: (row) => <ProductThumbnail product={row} /> },
    {
      id: "internalName",
      label: dictionary.adminProductInternalName,
      value: (row) => <span className="font-medium">{row.internalName}</span>,
    },
    {
      id: "title",
      label: dictionary.catalogProductTitleColumn,
      value: (row) => <ProductTitle dictionary={dictionary} locale={locale} product={row} />,
    },
    {
      id: "price",
      label: dictionary.adminProductPrice,
      numeric: true,
      value: (row) => <MoneyText value={formatCatalogPrice(row.price, row.currencyCode, locale)} />,
    },
    {
      id: "category",
      label: dictionary.catalogProductCategoryColumn,
      value: (row) => (
        <CategoryPill categoryId={row.categoryId} categoryNames={categoryNames} noneLabel={dictionary.catalogProductCategoryNone} />
      ),
    },
    {
      id: "state",
      label: dictionary.catalogProductStateColumn,
      value: (row) => <ProductStateBadge dictionary={dictionary} product={row} />,
    },
  ];

  const stateFilter = typeof query.filters.state === "string" ? query.filters.state : query.filters.state?.[0];
  const categoryFilter = typeof query.filters.category === "string" ? [query.filters.category] : query.filters.category;
  const filtered = products.filter(
    (product) =>
      matchesSearch(product, query.q)
      && (!stateFilter || productState(product) === stateFilter)
      && (!categoryFilter || (product.categoryId !== null && categoryFilter.includes(product.categoryId))),
  );
  const filtering = Boolean(query.q) || Boolean(stateFilter) || Boolean(categoryFilter);
  const state: DataDirectoryState =
    products.length === 0 && !filtering ? "empty" : filtered.length === 0 ? "filtered-empty" : "ready";
  const truncated = filtered.length > query.pageSize;
  const rows = truncated ? filtered.slice(0, query.pageSize) : filtered;

  return (
    <>
      <DataDirectory
        actionsLabel={dictionary.catalogProductActionsColumn}
        caption={dictionary.shellProducts}
        columns={columns}
        canonicalFilterQuery={query.canonicalFilterQuery}
        copy={dataDirectoryCopy(dictionary, { title: dictionary.catalogProductsEmpty, description: dictionary.catalogProductsEmptyDescription })}
        emptyAction={{ href: "/catalog/products/new", label: dictionary.adminProductCreate }}
        filters={[
          {
            name: "state",
            label: dictionary.catalogProductFilterState,
            allLabel: dictionary.catalogProductFilterAllStates,
            ...(stateFilter ? { selected: stateFilter } : {}),
            options: STATE_FILTER_VALUES.map((value) => ({
              value,
              label:
                value === "active"
                  ? dictionary.catalogProductStateActive
                  : value === "inactive"
                    ? dictionary.catalogProductStateInactive
                    : dictionary.catalogProductStateArchived,
            })),
          },
          ...(categories.length > 0
            ? [
                {
                  name: "category",
                  label: dictionary.catalogProductFilterCategory,
                  allLabel: dictionary.catalogProductFilterAllCategories,
                  ...(categoryFilter?.[0] ? { selected: categoryFilter[0] } : {}),
                  options: categories.map((category) => ({
                    value: category.id,
                    label: locale === "pt-BR" ? category.namePtBr : category.nameEn,
                  })),
                },
              ]
            : []),
        ]}
        formAction="/catalog"
        getRowActions={(row) => (
          <Button asChild data-ds-hit-target size="sm" variant={row.archivedAt !== null ? "ghost" : "secondary"}>
            <Link href={`/catalog/products/${row.id}`}>
              {row.archivedAt !== null ? dictionary.catalogProductView : dictionary.catalogProductEdit}
            </Link>
          </Button>
        )}
        getRowHref={(row) => `/catalog/products/${row.id}`}
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
  const invalidFiltersNotice = params[DIRECTORY_INVALID_FILTERS_PARAM] === DIRECTORY_INVALID_FILTERS_VALUE;
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
      ...(categories.length > 0
        ? [{ name: "category", kind: "enum", values: categories.map((category) => category.id) } as const]
        : []),
    ],
    noticeKey: "products",
    noticeValues: PRODUCT_NOTICE_VALUES,
  });
  if (query.status === "redirect") redirect(query.location);
  if (query.status === "invalid-query") redirect(directoryInvalidFiltersLocation("/catalog"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WorkspaceHeading
          description={dictionary.catalogProductsDescription}
          eyebrow={dictionary.shellMerchantEyebrow}
          title={dictionary.shellProducts}
        />
        <div className="flex items-center gap-2">
          <Button asChild data-ds-hit-target variant="outline">
            <Link href="/catalog/categories">{dictionary.catalogCategoriesTitle}</Link>
          </Button>
          <Button asChild data-ds-hit-target>
            <Link href="/catalog/products/new">
              <Plus aria-hidden className="size-4" />
              {dictionary.adminProductCreate}
            </Link>
          </Button>
        </div>
      </div>
      {invalidFiltersNotice ? <DirectoryInvalidFiltersNotice dictionary={dictionary} /> : null}
      {query.notice ? <ProductNotice dictionary={dictionary} notice={query.notice} /> : null}
      {loadFailed ? (
        <DataDirectory
          caption={dictionary.shellProducts}
          columns={[]}
          copy={dataDirectoryCopy(dictionary, { title: dictionary.catalogProductsEmpty, description: dictionary.catalogProductsEmptyDescription })}
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
    </div>
  );
}

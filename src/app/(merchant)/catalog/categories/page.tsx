import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductService, type OwnerProduct } from "@/auth/product";
import { getProductCategoryService, type OwnerProductCategory } from "@/auth/product-category";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";

import { requireMerchantShellContext } from "../../shell-context";
import { CategoryNotice } from "../catalog-notices";
import { Breadcrumb, SectionCard } from "../catalog-fields";
import { catalogDirectoryCopy } from "../directory-copy";
import { resolveCatalogDirectoryQuery, type CatalogSearchParams } from "../directory-query";

import { CategoryRowActions } from "./category-row-actions";

type Dictionary = ReturnType<typeof getDictionary>;

const CATEGORY_NOTICE_VALUES = ["create", "edit", "deactivate", "conflict", "failed"] as const;
const STATE_FILTER_VALUES = ["active", "inactive"] as const;

function CreateCategoryCard({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <SectionCard title={dictionary.catalogCategoryCreateHeading}>
      <form action="/product-categories" id="category-create" method="post">
        <input name="action" type="hidden" value="create" />
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="text-sm font-medium" htmlFor="category-create-name-pt-br">
              {dictionary.catalogCategoryNamePtBr}
            </label>
            <input
              className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
              id="category-create-name-pt-br"
              name="namePtBr"
              required
            />
          </div>
          <div>
            <label className="text-sm font-medium" htmlFor="category-create-name-en">
              {dictionary.catalogCategoryNameEn}
            </label>
            <input
              className="mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring"
              id="category-create-name-en"
              name="nameEn"
              required
            />
          </div>
          <Button type="submit">
            <Plus aria-hidden className="size-4" />
            {dictionary.catalogCategoryCreate}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function CategoryDirectory({
  categories,
  dictionary,
  products,
  query,
}: Readonly<{
  categories: readonly OwnerProductCategory[];
  dictionary: Dictionary;
  products: readonly OwnerProduct[];
  query: Extract<ReturnType<typeof resolveCatalogDirectoryQuery>, { status: "ready" | "invalid-query" }>;
}>) {
  const referenceCount = new Map<string, number>();
  for (const product of products) {
    if (product.categoryId) referenceCount.set(product.categoryId, (referenceCount.get(product.categoryId) ?? 0) + 1);
  }
  const copy = catalogDirectoryCopy(dictionary, {
    title: dictionary.catalogCategoriesEmpty,
    description: dictionary.catalogCategoriesEmptyDescription,
  });
  const columns: readonly DataDirectoryColumn<OwnerProductCategory>[] = [
    {
      id: "namePtBr",
      label: dictionary.catalogCategoryNamePtBr,
      value: (row) => <span className="font-medium">{row.namePtBr}</span>,
    },
    { id: "nameEn", label: dictionary.catalogCategoryNameEn, value: (row) => row.nameEn },
    {
      id: "state",
      label: dictionary.catalogCategoryStateColumn,
      value: (row) =>
        row.active ? (
          <Badge variant="secondary">{dictionary.catalogCategoryStateActive}</Badge>
        ) : (
          <Badge variant="outline">{dictionary.catalogCategoryStateInactive}</Badge>
        ),
    },
    {
      id: "products",
      label: dictionary.catalogCategoryProductsColumn,
      numeric: true,
      value: (row) => {
        const count = referenceCount.get(row.id) ?? 0;
        return <span className={count === 0 ? "text-muted-foreground" : ""}>{String(count)}</span>;
      },
    },
  ];

  if (query.status === "invalid-query") {
    return (
      <DataDirectory
        caption={dictionary.catalogCategoriesTitle}
        columns={columns}
        copy={copy}
        formAction="/catalog/categories"
        idPrefix="catalog-categories"
        resetUrl="/catalog/categories"
        rowKey={(row) => row.id}
        rows={[]}
        state="invalid-query"
      />
    );
  }

  const stateFilter = typeof query.filters.state === "string" ? query.filters.state : query.filters.state?.[0];
  const needle = query.q?.toLocaleLowerCase();
  const filtered = categories.filter(
    (category) =>
      (!needle ||
        category.namePtBr.toLocaleLowerCase().includes(needle) ||
        category.nameEn.toLocaleLowerCase().includes(needle))
      && (!stateFilter || (stateFilter === "active") === category.active),
  );
  const filtering = Boolean(needle) || Boolean(stateFilter);
  const state: DataDirectoryState =
    categories.length === 0 && !filtering ? "empty" : filtered.length === 0 ? "filtered-empty" : "ready";
  const truncated = filtered.length > query.pageSize;
  const rows = truncated ? filtered.slice(0, query.pageSize) : filtered;

  return (
    <>
      <DataDirectory
        actionsLabel={dictionary.catalogCategoryActionsColumn}
        caption={dictionary.catalogCategoriesTitle}
        columns={columns}
        copy={copy}
        filters={[
          {
            name: "state",
            label: dictionary.catalogCategoryFilterState,
            allLabel: dictionary.catalogCategoryFilterAllStates,
            ...(stateFilter ? { selected: stateFilter } : {}),
            options: STATE_FILTER_VALUES.map((value) => ({
              value,
              label: value === "active" ? dictionary.catalogCategoryStateActive : dictionary.catalogCategoryStateInactive,
            })),
          },
        ]}
        formAction="/catalog/categories"
        getRowActions={(row) =>
          row.active ? (
            <CategoryRowActions
              activeReplacements={categories.filter((candidate) => candidate.active && candidate.id !== row.id)}
              category={row}
              dictionary={dictionary}
              references={referenceCount.get(row.id) ?? 0}
            />
          ) : null
        }
        idPrefix="catalog-categories"
        pageSize={query.pageSize}
        resetUrl="/catalog/categories"
        retryUrl="/catalog/categories"
        rowKey={(row) => row.id}
        rows={rows}
        {...(query.q ? { search: query.q } : {})}
        state={state}
      />
      {truncated ? <p className="text-sm text-muted-foreground">{dictionary.catalogCategoriesTruncated}</p> : null}
    </>
  );
}

export default async function CatalogCategoriesPage({
  searchParams = Promise.resolve({}),
}: Readonly<{
  searchParams?: Promise<CatalogSearchParams>;
}> = {}) {
  const { dictionary, principal } = await requireMerchantShellContext();
  const params = await searchParams;
  let categories: readonly OwnerProductCategory[];
  let products: readonly OwnerProduct[];
  let loadFailed = false;
  try {
    [categories, products] = await Promise.all([
      getProductCategoryService().listForOwner(principal),
      getProductService().listForOwner(principal),
    ]);
  } catch {
    categories = [];
    products = [];
    loadFailed = true;
  }

  const query = resolveCatalogDirectoryQuery({
    path: "/catalog/categories",
    searchParams: params,
    definitions: [{ name: "state", kind: "enum", values: STATE_FILTER_VALUES }],
    noticeKey: "categories",
    noticeValues: CATEGORY_NOTICE_VALUES,
  });
  if (query.status === "redirect") redirect(query.location);

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { href: "/catalog", label: dictionary.shellProducts },
          { label: dictionary.catalogCategoriesTitle },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <WorkspaceHeading
          description={dictionary.catalogCategoriesDescription}
          eyebrow={dictionary.shellMerchantEyebrow}
          title={dictionary.catalogCategoriesTitle}
        />
        <Button asChild data-ds-hit-target variant="outline">
          <Link href="/catalog">{dictionary.catalogProductBackToCatalog}</Link>
        </Button>
      </div>
      {query.status === "ready" && query.notice ? <CategoryNotice dictionary={dictionary} notice={query.notice} /> : null}
      <CreateCategoryCard dictionary={dictionary} />
      {loadFailed ? (
        <DataDirectory
          caption={dictionary.catalogCategoriesTitle}
          columns={[]}
          copy={catalogDirectoryCopy(dictionary, {
            title: dictionary.catalogCategoriesEmpty,
            description: dictionary.catalogCategoriesEmptyDescription,
          })}
          formAction="/catalog/categories"
          idPrefix="catalog-categories"
          resetUrl="/catalog/categories"
          retryUrl="/catalog/categories"
          rowKey={() => "none"}
          rows={[]}
          state="error"
        />
      ) : (
        <CategoryDirectory categories={categories} dictionary={dictionary} products={products} query={query} />
      )}
    </div>
  );
}

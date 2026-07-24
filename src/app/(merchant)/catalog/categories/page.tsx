import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import { getProductService, type OwnerProduct } from "@/auth/product";
import { getProductCategoryService, type OwnerProductCategory } from "@/auth/product-category";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { DataDirectory, type DataDirectoryColumn, type DataDirectoryState } from "@/data-directory/ui/data-directory";
import type { getDictionary } from "@/i18n/dictionaries";

import { requireMerchantShellContext } from "../../shell-context";
import { CategoryNotice } from "../catalog-notices";
import { CatalogSubmit } from "../catalog-submit";
import { catalogDirectoryCopy } from "../directory-copy";
import { resolveCatalogDirectoryQuery, type CatalogSearchParams } from "../directory-query";

type Dictionary = ReturnType<typeof getDictionary>;

const CATEGORY_NOTICE_VALUES = ["create", "edit", "deactivate", "conflict", "failed"] as const;
const STATE_FILTER_VALUES = ["active", "inactive"] as const;

function CreateCategoryCard({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.catalogCategoryCreateHeading}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action="/product-categories" id="category-create" method="post">
          <Input name="action" type="hidden" value="create" />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="category-create-name-pt-br">{dictionary.catalogCategoryNamePtBr}</FieldLabel>
              <Input id="category-create-name-pt-br" name="namePtBr" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="category-create-name-en">{dictionary.catalogCategoryNameEn}</FieldLabel>
              <Input id="category-create-name-en" name="nameEn" required />
            </Field>
            <CatalogSubmit form="category-create" label={dictionary.catalogCategoryCreate} />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function CategoryRowActions({
  activeReplacements,
  category,
  dictionary,
  references,
}: Readonly<{
  activeReplacements: readonly OwnerProductCategory[];
  category: OwnerProductCategory;
  dictionary: Dictionary;
  references: number;
}>) {
  const editFormId = `category-${category.id}-edit`;
  const deactivateFormId = `category-${category.id}-deactivate`;

  return (
    <div className="flex flex-col gap-4">
      <details>
        <summary>{dictionary.catalogCategoryEdit}</summary>
        <form action="/product-categories" id={editFormId} method="post">
          <Input name="action" type="hidden" value="edit" />
          <Input name="id" type="hidden" value={category.id} />
          <Input name="version" type="hidden" value={category.version} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${editFormId}-name-pt-br`}>{dictionary.catalogCategoryNamePtBr}</FieldLabel>
              <Input defaultValue={category.namePtBr} id={`${editFormId}-name-pt-br`} name="namePtBr" required />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${editFormId}-name-en`}>{dictionary.catalogCategoryNameEn}</FieldLabel>
              <Input defaultValue={category.nameEn} id={`${editFormId}-name-en`} name="nameEn" required />
            </Field>
            <CatalogSubmit label={dictionary.catalogCategorySave} />
          </FieldGroup>
        </form>
      </details>
      <details>
        <summary>{dictionary.catalogCategoryDeactivateHeading}</summary>
        <Alert variant="warning">
          <AlertTitle>{dictionary.catalogCategoryDeactivateConfirm}</AlertTitle>
          <AlertDescription>{dictionary.catalogCategoryDeactivateDescription}</AlertDescription>
        </Alert>
        {references > 0 && activeReplacements.length === 0 ? (
          <Alert variant="destructive">
            <AlertTitle>{dictionary.catalogCategoryDeactivateHeading}</AlertTitle>
            <AlertDescription>{dictionary.catalogCategoryDeactivateNoReplacement}</AlertDescription>
          </Alert>
        ) : (
          <form action="/product-categories" id={deactivateFormId} method="post">
            <Input name="action" type="hidden" value="deactivate" />
            <Input name="id" type="hidden" value={category.id} />
            <Input name="version" type="hidden" value={category.version} />
            <FieldGroup>
              {references > 0 ? (
                <Field>
                  <FieldLabel htmlFor={`${deactivateFormId}-replacement`}>{dictionary.catalogCategoryDeactivateReplacement}</FieldLabel>
                  <NativeSelect data-ds-hit-target defaultValue="" id={`${deactivateFormId}-replacement`} name="replacementId" required>
                    <NativeSelectOption disabled value="">{dictionary.catalogCategoryDeactivateReplacementRequired}</NativeSelectOption>
                    {activeReplacements.map((replacement) => (
                      <NativeSelectOption key={replacement.id} value={replacement.id}>{replacement.namePtBr} / {replacement.nameEn}</NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              ) : null}
              <CatalogSubmit label={dictionary.catalogCategoryDeactivate} tone="destructive" />
            </FieldGroup>
          </form>
        )}
      </details>
    </div>
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
  const copy = catalogDirectoryCopy(dictionary, { title: dictionary.catalogCategoriesEmpty, description: dictionary.catalogCategoriesEmptyDescription });
  const columns: readonly DataDirectoryColumn<OwnerProductCategory>[] = [
    { id: "namePtBr", label: dictionary.catalogCategoryNamePtBr, value: (row) => row.namePtBr },
    { id: "nameEn", label: dictionary.catalogCategoryNameEn, value: (row) => row.nameEn },
    {
      id: "state",
      label: dictionary.catalogCategoryStateColumn,
      value: (row) => row.active
        ? <Badge variant="secondary">{dictionary.catalogCategoryStateActive}</Badge>
        : <Badge variant="outline">{dictionary.catalogCategoryStateInactive}</Badge>,
    },
    { id: "products", label: dictionary.catalogCategoryProductsColumn, numeric: true, value: (row) => String(referenceCount.get(row.id) ?? 0) },
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
  const filtered = categories.filter((category) =>
    (!needle || category.namePtBr.toLocaleLowerCase().includes(needle) || category.nameEn.toLocaleLowerCase().includes(needle))
    && (!stateFilter || (stateFilter === "active") === category.active));
  const filtering = Boolean(needle) || Boolean(stateFilter);
  const state: DataDirectoryState = categories.length === 0 && !filtering
    ? "empty"
    : filtered.length === 0
      ? "filtered-empty"
      : "ready";
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
        getRowActions={(row) => row.active ? (
          <CategoryRowActions
            activeReplacements={categories.filter((candidate) => candidate.active && candidate.id !== row.id)}
            category={row}
            dictionary={dictionary}
            references={referenceCount.get(row.id) ?? 0}
          />
        ) : null}
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
    <>
      <WorkspaceHeading description={dictionary.catalogCategoriesDescription} eyebrow={dictionary.shellMerchantEyebrow} title={dictionary.catalogCategoriesTitle} />
      {query.status === "ready" && query.notice ? <CategoryNotice dictionary={dictionary} notice={query.notice} /> : null}
      <div className="flex flex-wrap gap-3">
        <Button asChild data-ds-hit-target variant="outline">
          <Link href="/catalog">{dictionary.catalogProductBackToCatalog}</Link>
        </Button>
      </div>
      <CreateCategoryCard dictionary={dictionary} />
      {loadFailed ? (
        <DataDirectory
          caption={dictionary.catalogCategoriesTitle}
          columns={[]}
          copy={catalogDirectoryCopy(dictionary, { title: dictionary.catalogCategoriesEmpty, description: dictionary.catalogCategoriesEmptyDescription })}
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
    </>
  );
}

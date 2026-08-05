"use client";

import { useRef, useState } from "react";
import { Archive } from "lucide-react";

import { WorkspaceHeading } from "@/app-shell/workspace-heading";
import type { OwnerProduct } from "@/auth/product";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/modal";
import { StatusBadge } from "@/components/ui/status-badge";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { CatalogSubmit } from "../../../catalog-submit";
import { Banner, Breadcrumb } from "../../../catalog-fields";
import { ProductForm } from "../../../product-form";

type Dictionary = ReturnType<typeof getDictionary>;

function ArchivedBanner({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <Banner tone="warning">
      <p className="font-medium">{dictionary.catalogProductArchivedBannerTitle}</p>
      <p className="mt-0.5">{dictionary.catalogProductArchivedNotice}</p>
    </Banner>
  );
}

function ProductHeader({
  dictionary,
  product,
}: Readonly<{
  dictionary: Dictionary;
  product: OwnerProduct;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {product.imageMediaId ? (
        <img
          alt=""
          className="size-12 rounded-md border border-border object-cover"
          height={48}
          src={`/media/${product.imageMediaId}`}
          width={48}
        />
      ) : null}
      <h1 className="font-heading text-2xl leading-snug font-medium text-foreground">{product.internalName}</h1>
      {product.archivedAt !== null ? (
        <StatusBadge archived label={dictionary.catalogProductStateArchived} tone="danger" />
      ) : product.active ? (
        <StatusBadge label={dictionary.catalogProductStateActive} tone="success" />
      ) : (
        <StatusBadge label={dictionary.catalogProductStateInactive} tone="neutral" />
      )}
    </div>
  );
}

function ActiveToggleForm({
  active,
  dictionary,
  formId,
  product,
}: Readonly<{
  active: boolean;
  dictionary: Dictionary;
  formId: string;
  product: OwnerProduct;
}>) {
  return (
    <form action="/products" className="sr-only" id={formId} method="post">
      <Input name="action" type="hidden" value="active" />
      <Input name="id" type="hidden" value={product.id} />
      <Input name="version" type="hidden" value={product.version} />
      <Input name="active" type="hidden" value={String(active)} />
      <CatalogSubmit form={formId} label={active ? dictionary.catalogProductActivate : dictionary.catalogProductDeactivate} />
    </form>
  );
}

function ArchiveForm({
  dictionary,
  formId,
  product,
}: Readonly<{
  dictionary: Dictionary;
  formId: string;
  product: OwnerProduct;
}>) {
  return (
    <form action="/products" className="sr-only" id={formId} method="post">
      <Input name="action" type="hidden" value="archive" />
      <Input name="id" type="hidden" value={product.id} />
      <Input name="version" type="hidden" value={product.version} />
      <CatalogSubmit form={formId} label={dictionary.catalogProductArchive} tone="destructive" />
    </form>
  );
}

export function ProductDetailClient({
  categories,
  choices,
  dictionary,
  locale,
  product,
}: Readonly<{
  categories: readonly { id: string; namePtBr: string; nameEn: string; active: boolean }[];
  choices: readonly { code: string; label: string }[];
  dictionary: Dictionary;
  locale: SupportedLocale;
  product: OwnerProduct | undefined;
}>) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [activeDialogOpen, setActiveDialogOpen] = useState(false);
  const [pendingActive, setPendingActive] = useState(product?.active ?? true);
  const activeFormRef = useRef<HTMLFormElement>(null);
  const archiveFormRef = useRef<HTMLFormElement>(null);

  if (!product) {
    return (
      <div className="space-y-6">
        <WorkspaceHeading
          description={dictionary.catalogProductsDescription}
          eyebrow={dictionary.shellMerchantEyebrow}
          title={dictionary.catalogProductUnavailable}
        />
        <Alert variant="destructive">
          <AlertTitle>{dictionary.catalogProductUnavailable}</AlertTitle>
          <AlertDescription>{dictionary.catalogProductUnavailableDescription}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const archived = product.archivedAt !== null;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { href: "/catalog", label: dictionary.shellProducts },
          { label: product.internalName },
        ]}
      />
      <WorkspaceHeading
        description={archived ? dictionary.catalogProductArchivedNotice : dictionary.catalogProductEditDescription}
        eyebrow={dictionary.shellMerchantEyebrow}
        title={archived ? product.internalName : dictionary.catalogProductEditTitle}
      />
      <ProductHeader dictionary={dictionary} product={product} />

      {archived ? <ArchivedBanner dictionary={dictionary} /> : null}

      <ProductForm
        categories={categories}
        choices={choices}
        dictionary={dictionary}
        formId="product-edit"
        locale={locale}
        onActiveChange={(active) => {
          setPendingActive(active);
          setActiveDialogOpen(true);
        }}
        product={product}
        readOnly={archived}
      />

      {!archived ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setArchiveOpen(true)}
              type="button"
              variant="outline"
            >
              <Archive aria-hidden className="size-4" />
              {dictionary.catalogProductArchive}
            </Button>
            <CatalogSubmit form="product-edit" label={dictionary.adminProductSave} />
          </div>

          <ActiveToggleForm
            active={pendingActive}
            dictionary={dictionary}
            formId="product-active-toggle"
            product={product}
          />
          <ArchiveForm dictionary={dictionary} formId="product-archive" product={product} />

          <ConfirmDialog
            cancelLabel={dictionary.dataDirectoryResetFilters}
            confirmLabel={pendingActive ? dictionary.catalogProductActivate : dictionary.catalogProductDeactivate}
            destructive={!pendingActive}
            description={
              pendingActive
                ? dictionary.catalogProductActivateConfirmDescription
                : dictionary.catalogProductDeactivateConfirmDescription
            }
            failureMessage={dictionary.adminProductMutationFailed}
            onConfirm={() => activeFormRef.current?.requestSubmit()}
            onOpenChange={setActiveDialogOpen}
            open={activeDialogOpen}
            pendingLabel={dictionary.dataDirectoryLoading}
            title={pendingActive ? dictionary.catalogProductActivateConfirmTitle : dictionary.catalogProductDeactivateConfirmTitle}
          />
          <ConfirmDialog
            cancelLabel={dictionary.dataDirectoryResetFilters}
            confirmLabel={dictionary.catalogProductArchive}
            description={dictionary.catalogProductArchiveDescription}
            destructive
            failureMessage={dictionary.adminProductMutationFailed}
            onConfirm={() => archiveFormRef.current?.requestSubmit()}
            onOpenChange={setArchiveOpen}
            open={archiveOpen}
            pendingLabel={dictionary.dataDirectoryLoading}
            title={dictionary.catalogProductArchiveConfirm}
          />
        </>
      ) : null}
    </div>
  );
}

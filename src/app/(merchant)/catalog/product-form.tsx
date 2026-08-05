"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import type { OwnerProduct } from "@/auth/product";
import type { OwnerProductCategory } from "@/auth/product-category";
import type { ExchangeCurrencyChoice } from "@/auth/supported-exchange-currency";
import { BrandIdentity } from "@/brand/brand-identity";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocalizedFieldGroup } from "@/components/ui/localized-field-group";
import { MoneyText } from "@/components/ui/money-text";
import { NativeSelectOption } from "@/components/ui/native-select";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { CatalogSubmit } from "./catalog-submit";
import {
  Banner,
  DirtyNativeSelect,
  ImageField,
  type ImageFieldCopy,
  SegmentedControl,
  SectionCard,
} from "./catalog-fields";
import { formatCatalogPrice } from "./price-format";

type Dictionary = ReturnType<typeof getDictionary>;

function CurrencyField({
  choices,
  defaultValue,
  dictionary,
  formId,
  readOnly,
  stored,
}: Readonly<{
  choices: readonly ExchangeCurrencyChoice[];
  defaultValue?: string | null;
  dictionary: Dictionary;
  formId: string;
  readOnly?: boolean;
  stored: string | null;
}>) {
  const mapped = stored ? choices.some((choice) => choice.code === stored) : false;
  const showStored = stored && !mapped;

  if (choices.length === 0) {
    return (
      <>
        {showStored ? (
          <Field>
            <FieldLabel htmlFor={`${formId}-currency-stored`}>{dictionary.catalogProductCurrencyStored}</FieldLabel>
            <Input disabled id={`${formId}-currency-stored`} value={stored} />
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor={`${formId}-currency`}>{dictionary.catalogProductCurrencyLabel}</FieldLabel>
            <DirtyNativeSelect disabled fieldName="currencyCode" form={`${formId}-currency`} id={`${formId}-currency`}>
              <NativeSelectOption value="">{dictionary.catalogProductCurrencyNone}</NativeSelectOption>
            </DirtyNativeSelect>
          </Field>
        )}
        <Banner tone="warning">
          <p className="font-medium">{dictionary.catalogProductCurrencyUnavailable}</p>
          <p className="mt-0.5">{dictionary.catalogProductCurrencyUnavailableDescription}</p>
        </Banner>
      </>
    );
  }

  return (
    <>
      {showStored ? (
        <Field>
          <FieldLabel htmlFor={`${formId}-currency-stored`}>{dictionary.catalogProductCurrencyStored}</FieldLabel>
          <Input disabled id={`${formId}-currency-stored`} value={stored} />
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${formId}-currency`}>{dictionary.catalogProductCurrencyLabel}</FieldLabel>
        <DirtyNativeSelect
          defaultValue={mapped && stored ? stored : ""}
          disabled={readOnly}
          fieldName="currencyCode"
          id={`${formId}-currency`}
        >
          <NativeSelectOption value="">{dictionary.catalogProductCurrencyNone}</NativeSelectOption>
          {choices.map((choice) => (
            <NativeSelectOption key={choice.code} value={choice.code}>
              {choice.code} — {choice.label}
            </NativeSelectOption>
          ))}
        </DirtyNativeSelect>
      </Field>
    </>
  );
}

function ProductPreview({
  dictionary,
  imageMediaId,
  locale,
  price,
  currencyCode,
  title,
  description,
}: Readonly<{
  dictionary: Dictionary;
  imageMediaId: string | null;
  locale: SupportedLocale;
  price: string;
  currencyCode: string | null;
  title: string;
  description: string;
}>) {
  const formattedPrice = formatCatalogPrice(price, null, locale);
  return (
    <div className="lg:col-span-4">
      <div className="sticky top-20 rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="font-heading text-compact-heading font-medium text-card-foreground">{dictionary.catalogProductPreviewTitle}</h3>
        <div className="mt-4 flex items-center gap-3">
          {imageMediaId ? (
            <img
              alt=""
              className="size-14 rounded-md border border-border object-cover"
              height={56}
              src={`/media/${imageMediaId}`}
              width={56}
            />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
              <BrandIdentity variant="merchant-fallback" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-card-foreground">
              {title || dictionary.catalogProductPreviewNoTitle}
            </p>
            <MoneyText className="mt-0.5" pairLabel={currencyCode ?? undefined} value={formattedPrice} />
          </div>
        </div>
        {description ? <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

export function ProductForm({
  categories,
  choices,
  dictionary,
  formId,
  locale,
  onActiveChange,
  product,
  readOnly,
}: Readonly<{
  categories: readonly OwnerProductCategory[];
  choices: readonly ExchangeCurrencyChoice[];
  dictionary: Dictionary;
  formId: string;
  locale: SupportedLocale;
  onActiveChange?: (active: boolean) => void;
  product?: OwnerProduct;
  readOnly?: boolean;
}>) {
  const creating = !product;
  const activeCategories = categories.filter((category) => category.active);

  const [internalName, setInternalName] = useState(product?.internalName ?? "");
  const [titlePtBr, setTitlePtBr] = useState(product?.titlePtBr ?? "");
  const [titleEn, setTitleEn] = useState(product?.titleEn ?? "");
  const [descriptionPtBr, setDescriptionPtBr] = useState(product?.descriptionPtBr ?? "");
  const [descriptionEn, setDescriptionEn] = useState(product?.descriptionEn ?? "");
  const [price, setPrice] = useState(product?.price ?? "");
  const [imageMediaId, setImageMediaId] = useState(product?.imageMediaId ?? null);
  const [imageDirty, setImageDirty] = useState(false);

  const imageCopy: ImageFieldCopy = {
    add: dictionary.catalogProductImageUpload,
    alt: dictionary.catalogProductImageAlt,
    failed: dictionary.catalogProductImageFailed,
    failedTitle: dictionary.adminErrorHeading,
    remove: dictionary.catalogProductImageRemove,
    replace: dictionary.catalogProductImageReplace,
    retry: dictionary.dataDirectoryRetry,
    upload: dictionary.catalogProductImageUpload,
    uploading: dictionary.catalogProductImageUploading,
  };

  const previewTitle = locale === "pt-BR" ? titlePtBr : titleEn;
  const previewDescription = locale === "pt-BR" ? descriptionPtBr : descriptionEn;

  const activeStateOptions = useMemo(
    () => [
      { value: "active", label: dictionary.catalogProductStateActive },
      { value: "inactive", label: dictionary.catalogProductStateInactive },
    ],
    [dictionary],
  );

  return (
    <form action="/products" id={formId} method="post">
      <Input name="action" type="hidden" value={creating ? "create" : "update"} />
      {product ? (
        <>
          <Input name="id" type="hidden" value={product.id} />
          <Input name="version" type="hidden" value={product.version} />
        </>
      ) : null}
      <Input name="internalName" type="hidden" value={internalName} />
      <Input name="titlePtBr" type="hidden" value={titlePtBr} />
      <Input name="titleEn" type="hidden" value={titleEn} />
      <Input name="descriptionPtBr" type="hidden" value={descriptionPtBr} />
      <Input name="descriptionEn" type="hidden" value={descriptionEn} />
      <Input name="price" type="hidden" value={price} />
      {imageDirty ? <Input name="imageMediaId" type="hidden" value={imageMediaId ?? ""} /> : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <SectionCard description={dictionary.catalogProductSectionBasicDescription} title={dictionary.catalogProductSectionBasicTitle}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${formId}-internal-name`}>{dictionary.adminProductInternalName}</FieldLabel>
                <Input
                  disabled={readOnly}
                  id={`${formId}-internal-name`}
                  onChange={(event) => setInternalName(event.target.value)}
                  required
                  value={internalName}
                />
                <FieldDescription>{dictionary.catalogProductInternalNameHelp}</FieldDescription>
              </Field>

              <LocalizedFieldGroup
                disabled={readOnly}
                fields={{
                  "pt-BR": {
                    localeLabel: "PT-BR",
                    label: dictionary.adminProductTitlePtBr,
                    value: titlePtBr,
                  },
                  en: {
                    localeLabel: "EN",
                    label: dictionary.adminProductTitleEn,
                    value: titleEn,
                  },
                }}
                groupLabel={dictionary.catalogProductTitleGroupLabel}
                id={`${formId}-title`}
                onValueChange={(locale, value) => {
                  if (locale === "pt-BR") setTitlePtBr(value);
                  else setTitleEn(value);
                }}
                required
              />

              <LocalizedFieldGroup
                disabled={readOnly}
                fields={{
                  "pt-BR": {
                    localeLabel: "PT-BR",
                    label: dictionary.adminProductDescriptionPtBr,
                    value: descriptionPtBr,
                  },
                  en: {
                    localeLabel: "EN",
                    label: dictionary.adminProductDescriptionEn,
                    value: descriptionEn,
                  },
                }}
                groupLabel={dictionary.catalogProductDescriptionGroupLabel}
                id={`${formId}-description`}
                multiline
                onValueChange={(locale, value) => {
                  if (locale === "pt-BR") setDescriptionPtBr(value);
                  else setDescriptionEn(value);
                }}
              />
            </FieldGroup>
          </SectionCard>

          <SectionCard description={dictionary.catalogProductSectionPricingDescription} title={dictionary.catalogProductSectionPricingTitle}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${formId}-price`}>{dictionary.adminProductPrice}</FieldLabel>
                <Input
                  disabled={readOnly}
                  id={`${formId}-price`}
                  inputMode="decimal"
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="0.00"
                  required
                  value={price}
                />
                <FieldDescription>{dictionary.adminProductPriceHelp}</FieldDescription>
              </Field>
              <CurrencyField
                choices={choices}
                defaultValue={product?.currencyCode}
                dictionary={dictionary}
                formId={formId}
                readOnly={readOnly}
                stored={product?.currencyCode ?? null}
              />
            </div>
          </SectionCard>

          <SectionCard description={dictionary.catalogProductSectionOrganizationDescription} title={dictionary.catalogProductSectionOrganizationTitle}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${formId}-category`}>{dictionary.catalogProductCategoryLabel}</FieldLabel>
                <DirtyNativeSelect
                  defaultValue={product?.categoryId ?? ""}
                  disabled={readOnly || activeCategories.length === 0}
                  fieldName="categoryId"
                  id={`${formId}-category`}
                >
                  <NativeSelectOption value="">{dictionary.catalogProductCategoryNone}</NativeSelectOption>
                  {activeCategories.map((category) => (
                    <NativeSelectOption key={category.id} value={category.id}>
                      {category.namePtBr} / {category.nameEn}
                    </NativeSelectOption>
                  ))}
                </DirtyNativeSelect>
                {activeCategories.length === 0 ? (
                  <Banner tone="info">
                    {dictionary.catalogProductNoCategory}{" "}
                    <Link className="font-medium underline" href="/catalog/categories">
                      {dictionary.catalogCategoriesTitle}
                    </Link>
                  </Banner>
                ) : null}
              </Field>

              {!creating && !readOnly ? (
                <Field>
                  <FieldLabel>{dictionary.catalogProductStateLabel}</FieldLabel>
                  <SegmentedControl
                    ariaLabel={dictionary.catalogProductStateLabel}
                    onChange={(value) => onActiveChange?.(value === "active")}
                    options={activeStateOptions}
                    value={product?.active ? "active" : "inactive"}
                  />
                </Field>
              ) : null}
            </FieldGroup>
          </SectionCard>

          <SectionCard description={dictionary.catalogProductImageHelp} title={dictionary.catalogProductImageLabel}>
            <ImageField
              copy={imageCopy}
              disabled={readOnly}
              initialIdentifier={product?.imageMediaId ?? null}
              inputId={`${formId}-image`}
              onChange={(identifier) => {
                setImageMediaId(identifier);
                setImageDirty(true);
              }}
              placeholder={<BrandIdentity variant="merchant-fallback" />}
            />
          </SectionCard>

          {!readOnly ? (
            <div className="flex justify-end">
              <CatalogSubmit form={formId} label={creating ? dictionary.adminProductCreate : dictionary.adminProductSave} />
            </div>
          ) : null}
        </div>

        <ProductPreview
          currencyCode={product?.currencyCode ?? null}
          description={previewDescription}
          dictionary={dictionary}
          imageMediaId={imageMediaId}
          locale={locale}
          price={price}
          title={previewTitle}
        />
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { clearFormDraft, hasFailureNotice, readFormDraft, saveFormDraft } from "@/app/form-draft";
import type { OwnerProduct } from "@/auth/product";
import type { OwnerProductCategory } from "@/auth/product-category";
import type { ExchangeCurrencyChoice } from "@/auth/supported-exchange-currency";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ImageUploader, type ImageUploaderLabels, type StagedImage } from "@/components/ui/image-uploader";
import { Input } from "@/components/ui/input";
import { LocalizedFieldGroup } from "@/components/ui/localized-field-group";
import { MoneyText } from "@/components/ui/money-text";
import { NativeSelectOption } from "@/components/ui/native-select";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

import { SegmentedControl } from "../merchant-controls";
import { CatalogSubmit } from "./catalog-submit";
import { Banner, DirtyNativeSelect } from "./catalog-fields";
import { formatCatalogPrice } from "./price-format";

const PRODUCT_NOTICE_KEY = "products";
const PRODUCT_FAILURE_NOTICES = ["conflict", "failed"] as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const PRICE_PATTERN = /^\d{1,12}(\.\d{1,6})?$/;

type Dictionary = ReturnType<typeof getDictionary>;

type ProductFormErrors = Readonly<{
  internalName?: string;
  titlePtBr?: string;
  titleEn?: string;
  price?: string;
}>;

function validateProductForm(
  values: Readonly<{ internalName: string; titlePtBr: string; titleEn: string; price: string }>,
  dictionary: Dictionary,
): ProductFormErrors {
  const errors: { internalName?: string; titlePtBr?: string; titleEn?: string; price?: string } = {};
  if (!values.internalName.trim()) errors.internalName = dictionary.catalogProductInternalNameRequired;
  if (!values.titlePtBr.trim()) errors.titlePtBr = dictionary.catalogProductTitleRequired;
  if (!values.titleEn.trim()) errors.titleEn = dictionary.catalogProductTitleRequired;
  const price = values.price.trim();
  if (!price || !PRICE_PATTERN.test(price)) errors.price = dictionary.catalogProductPriceInvalid;
  return errors;
}

async function stageProductImage(file: File): Promise<StagedImage> {
  const body = new FormData();
  body.set("image", file);
  const response = await fetch("/products/images", { method: "POST", body });
  if (!response.ok) throw new Error("staging unavailable");
  const payload: unknown = await response.json();
  const identifier =
    typeof payload === "object" && payload !== null && "identifier" in payload
      ? (payload as { identifier: unknown }).identifier
      : null;
  if (typeof identifier !== "string" || identifier.length === 0) throw new Error("staging unavailable");
  return { identifier, previewUrl: `/media/${identifier}` };
}

function CurrencyField({
  choices,
  dictionary,
  formId,
  onSelectedCurrencyChange,
  readOnly,
  stored,
}: Readonly<{
  choices: readonly ExchangeCurrencyChoice[];
  dictionary: Dictionary;
  formId: string;
  onSelectedCurrencyChange: (code: string | null) => void;
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
          onChange={(event) => onSelectedCurrencyChange(event.target.value || null)}
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
  currencyCode,
  description,
  dictionary,
  imageMediaId,
  locale,
  price,
  title,
}: Readonly<{
  currencyCode: string | null;
  description: string;
  dictionary: Dictionary;
  imageMediaId: string | null;
  locale: SupportedLocale;
  price: string;
  title: string;
}>) {
  const formattedPrice = formatCatalogPrice(price, null, locale);
  return (
    <div className="lg:col-span-4">
      <div className="sticky top-20 rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="font-heading text-compact-heading font-medium text-card-foreground">{dictionary.catalogProductPreviewTitle}</h3>
        <div className="mt-4 flex items-center gap-3">
          <Image
            alt=""
            className="size-14 rounded-md border border-border object-cover"
            height={56}
            src={imageMediaId ? `/media/${imageMediaId}` : "/application-assets/product-fallback.svg"}
            width={56}
          />
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
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(product?.currencyCode ?? null);
  const [errors, setErrors] = useState<ProductFormErrors>({});

  const draftKey = creating ? "product-create" : `product-edit-${product.id}`;

  useEffect(() => {
    if (readOnly) return;
    if (!hasFailureNotice(PRODUCT_NOTICE_KEY, PRODUCT_FAILURE_NOTICES)) {
      clearFormDraft(draftKey);
      return;
    }
    const draft = readFormDraft(draftKey);
    if (!draft) return;
    // sessionStorage is a client-only external system unavailable during the
    // server render, so seeding these fields cannot happen before mount; a
    // lazy `useState` initializer would instead read it during hydration and
    // desync from the server-rendered markup.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (typeof draft.internalName === "string") setInternalName(draft.internalName);
    if (typeof draft.titlePtBr === "string") setTitlePtBr(draft.titlePtBr);
    if (typeof draft.titleEn === "string") setTitleEn(draft.titleEn);
    if (typeof draft.descriptionPtBr === "string") setDescriptionPtBr(draft.descriptionPtBr);
    if (typeof draft.descriptionEn === "string") setDescriptionEn(draft.descriptionEn);
    if (typeof draft.price === "string") setPrice(draft.price);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [draftKey, readOnly]);

  const imageLabels: ImageUploaderLabels = {
    selectFile: dictionary.catalogProductImageSelectFile,
    hint: dictionary.catalogProductImageHint,
    replace: dictionary.catalogProductImageReplace,
    remove: dictionary.catalogProductImageRemove,
    retry: dictionary.dataDirectoryRetry,
    staging: dictionary.catalogProductImageUploading,
    staged: dictionary.catalogProductImageStaged,
    removed: dictionary.catalogProductImageRemoved,
    uploadFailed: dictionary.catalogProductImageFailed,
    invalidType: dictionary.catalogProductImageInvalidType,
    tooLarge: dictionary.catalogProductImageTooLarge,
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

  const fields = (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="space-y-5 lg:col-span-8">
        <FieldGroup>
          <Field data-invalid={Boolean(errors.internalName)}>
            <FieldLabel htmlFor={`${formId}-internal-name`}>{dictionary.adminProductInternalName}</FieldLabel>
            <Input
              aria-invalid={Boolean(errors.internalName)}
              disabled={readOnly}
              id={`${formId}-internal-name`}
              onChange={(event) => setInternalName(event.target.value)}
              required
              value={internalName}
            />
            <FieldDescription>{dictionary.catalogProductInternalNameHelp}</FieldDescription>
            {errors.internalName ? <FieldError>{errors.internalName}</FieldError> : null}
          </Field>

          <LocalizedFieldGroup
            disabled={readOnly}
            fields={{
              "pt-BR": {
                localeLabel: "PT-BR",
                label: dictionary.adminProductTitlePtBr,
                value: titlePtBr,
                error: errors.titlePtBr,
              },
              en: {
                localeLabel: "EN",
                label: dictionary.adminProductTitleEn,
                value: titleEn,
                error: errors.titleEn,
              },
            }}
            groupLabel={dictionary.catalogProductTitleGroupLabel}
            id={`${formId}-title`}
            onValueChange={(fieldLocale, value) => {
              if (fieldLocale === "pt-BR") setTitlePtBr(value);
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
            onValueChange={(fieldLocale, value) => {
              if (fieldLocale === "pt-BR") setDescriptionPtBr(value);
              else setDescriptionEn(value);
            }}
          />
        </FieldGroup>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.price)}>
            <FieldLabel htmlFor={`${formId}-price`}>{dictionary.adminProductPrice}</FieldLabel>
            <Input
              aria-invalid={Boolean(errors.price)}
              disabled={readOnly}
              id={`${formId}-price`}
              inputMode="decimal"
              onChange={(event) => setPrice(event.target.value)}
              placeholder="0.00"
              required
              value={price}
            />
            <FieldDescription>{dictionary.adminProductPriceHelp}</FieldDescription>
            {errors.price ? <FieldError>{errors.price}</FieldError> : null}
          </Field>
          <CurrencyField
            choices={choices}
            dictionary={dictionary}
            formId={formId}
            onSelectedCurrencyChange={setSelectedCurrency}
            readOnly={readOnly}
            stored={product?.currencyCode ?? null}
          />
        </div>

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

        <Field>
          <FieldLabel>{dictionary.catalogProductImageLabel}</FieldLabel>
          <ImageUploader
            accept={ACCEPTED_IMAGE_TYPES}
            currentPreviewUrl={product?.imageMediaId ? `/media/${product.imageMediaId}` : null}
            disabled={readOnly}
            labels={imageLabels}
            maxBytes={MAX_IMAGE_BYTES}
            onChange={(identifier) => {
              setImageMediaId(identifier);
              setImageDirty(true);
            }}
            stage={stageProductImage}
          />
          <FieldDescription>{dictionary.catalogProductImageHelp}</FieldDescription>
        </Field>
      </div>

      <ProductPreview
        currencyCode={selectedCurrency}
        description={previewDescription}
        dictionary={dictionary}
        imageMediaId={imageMediaId}
        locale={locale}
        price={price}
        title={previewTitle}
      />
    </div>
  );

  if (readOnly) {
    return <div id={formId}>{fields}</div>;
  }

  return (
    <form
      action="/products"
      id={formId}
      method="post"
      onSubmit={(event) => {
        const validationErrors = validateProductForm({ internalName, titlePtBr, titleEn, price }, dictionary);
        setErrors(validationErrors);
        if (Object.keys(validationErrors).length > 0) {
          event.preventDefault();
          return;
        }
        saveFormDraft(draftKey, {
          internalName,
          titlePtBr,
          titleEn,
          descriptionPtBr,
          descriptionEn,
          price,
        });
      }}
    >
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
      {fields}
      {creating ? (
        <div className="mt-5 flex justify-end">
          <CatalogSubmit form={formId} label={dictionary.adminProductCreate} />
        </div>
      ) : null}
    </form>
  );
}

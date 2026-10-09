"use client";

import Image from "next/image";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { clearFormDraft, hasFailureNotice, readFormDraft, saveFormDraft } from "@/app/form-draft";
import type { OwnerProduct } from "@/auth/product";
import type { OwnerProductCategory } from "@/auth/product-category";
import type { ExchangeCurrencyChoice } from "@/auth/supported-exchange-currency";
import { BrlAmountInput } from "@/app/(merchant)/links/link-brl-amount-input";
import { canonicalBrlInput, formatBrlDisplay } from "@/app/(merchant)/links/link-brl-amount";
import { isLinkMoneyAmount } from "@/app/(merchant)/links/link-money";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ImageUploader, type ImageUploaderLabels, type StagedImage } from "@/components/ui/image-uploader";
import { Input } from "@/components/ui/input";
import { LocalizedFieldGroup } from "@/components/ui/localized-field-group";
import { MoneyText } from "@/components/ui/money-text";
import { Modal } from "@/components/ui/modal";
import { showToast } from "@/components/ui/toast";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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
const MAX_INTERNAL_NAME = 128;
const MAX_TITLE = 160;
const MAX_DESCRIPTION = 2_000;
const MAX_CATEGORY_NAME = 160;

type Dictionary = ReturnType<typeof getDictionary>;

type ProductFormErrors = Readonly<{
  internalName?: string;
  titlePtBr?: string;
  titleEn?: string;
  descriptionPtBr?: string;
  descriptionEn?: string;
  price?: string;
}>;

function validateProductForm(
  values: Readonly<{
    internalName: string;
    titlePtBr: string;
    titleEn: string;
    descriptionPtBr: string;
    descriptionEn: string;
    price: string;
  }>,
  dictionary: Dictionary,
): ProductFormErrors {
  const errors: {
    internalName?: string; titlePtBr?: string; titleEn?: string;
    descriptionPtBr?: string; descriptionEn?: string; price?: string;
  } = {};
  const name = values.internalName.trim();
  if (!name) errors.internalName = dictionary.catalogProductInternalNameRequired;
  else if ([...name].length > MAX_INTERNAL_NAME || /[\r\n]/.test(name)) errors.internalName = dictionary.catalogProductInternalNameTooLong;
  const titlePtBr = values.titlePtBr.trim();
  const titleEn = values.titleEn.trim();
  if (!titlePtBr && !titleEn) {
    errors.titlePtBr = dictionary.catalogProductTitleRequired;
    errors.titleEn = dictionary.catalogProductTitleRequired;
  }
  if ([...titlePtBr].length > MAX_TITLE) errors.titlePtBr = dictionary.catalogProductTitleTooLong;
  if ([...titleEn].length > MAX_TITLE) errors.titleEn = dictionary.catalogProductTitleTooLong;
  if (!values.descriptionPtBr.trim() && !values.descriptionEn.trim()) {
    errors.descriptionPtBr = dictionary.catalogProductDescriptionRequired;
    errors.descriptionEn = dictionary.catalogProductDescriptionRequired;
  }
  if ([...values.descriptionPtBr.trim()].length > MAX_DESCRIPTION) errors.descriptionPtBr = dictionary.catalogProductDescriptionTooLong;
  if ([...values.descriptionEn.trim()].length > MAX_DESCRIPTION) errors.descriptionEn = dictionary.catalogProductDescriptionTooLong;
  if (!isLinkMoneyAmount(values.price)) errors.price = dictionary.catalogProductPriceInvalid;
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
  const localizedBrl = currencyCode === "BRL" && locale === "pt-BR";
  const formattedPrice = formatCatalogPrice(price, localizedBrl ? currencyCode : null, locale);
  return (
    <div className="lg:col-span-4">
      <div className="sticky top-20 rounded-card border border-border bg-surface p-5 shadow-sm">
        <h3 className="font-heading text-compact-heading font-medium text-text">{dictionary.catalogProductPreviewTitle}</h3>
        <div className="mt-4 flex items-center gap-3">
          <Image
            alt=""
            className="size-14 rounded-md border border-border object-cover"
            height={56}
            src={imageMediaId ? `/media/${imageMediaId}` : "/application-assets/product-fallback.svg"}
            width={56}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">
              {title || dictionary.catalogProductPreviewNoTitle}
            </p>
            <MoneyText className="mt-0.5" pairLabel={localizedBrl ? undefined : currencyCode ?? undefined} value={formattedPrice} />
          </div>
        </div>
        {description ? <p className="mt-3 line-clamp-3 text-xs text-text-2">{description}</p> : null}
      </div>
    </div>
  );
}

export function ProductForm({
  categories,
  choices,
  defaultCurrencyCode,
  dictionary,
  formId,
  locale,
  onActiveChange,
  product,
  readOnly,
}: Readonly<{
  categories: readonly OwnerProductCategory[];
  choices: readonly ExchangeCurrencyChoice[];
  defaultCurrencyCode?: string | null;
  dictionary: Dictionary;
  formId: string;
  locale: SupportedLocale;
  onActiveChange?: (active: boolean) => void;
  product?: OwnerProduct;
  readOnly?: boolean;
}>) {
  const creating = !product;
  const activeCategories = categories.filter((category) => category.active);
  const preselectedCurrencyCode =
    creating && defaultCurrencyCode && choices.some((choice) => choice.code === defaultCurrencyCode)
      ? defaultCurrencyCode
      : null;

  const [internalName, setInternalName] = useState(product?.internalName ?? "");
  const [titlePtBr, setTitlePtBr] = useState(product?.titlePtBr ?? "");
  const [titleEn, setTitleEn] = useState(product?.titleEn ?? "");
  const [descriptionPtBr, setDescriptionPtBr] = useState(product?.descriptionPtBr ?? "");
  const [descriptionEn, setDescriptionEn] = useState(product?.descriptionEn ?? "");
  const [price, setPrice] = useState(product?.price ? formatBrlDisplay(product.price) : "");
  const [imageMediaId, setImageMediaId] = useState(product?.imageMediaId ?? null);
  const [imageDirty, setImageDirty] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(product?.currencyCode ?? preselectedCurrencyCode);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [categoryOptions, setCategoryOptions] = useState<Pick<OwnerProductCategory, "id" | "namePtBr" | "nameEn">[]>(activeCategories);
  const [selectedCategory, setSelectedCategory] = useState(product?.categoryId ?? "");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryPending, setCategoryPending] = useState(false);
  const [categoryNamePtBr, setCategoryNamePtBr] = useState("");
  const [categoryNameEn, setCategoryNameEn] = useState("");
  const [categoryNameError, setCategoryNameError] = useState("");

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
    if (typeof draft.price === "string") setPrice(draft.price ? formatBrlDisplay(draft.price) : "");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [draftKey, readOnly]);

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const namePtBr = categoryNamePtBr.trim();
    const nameEn = categoryNameEn.trim();
    if (!namePtBr || !nameEn || /[\r\n]/.test(namePtBr + nameEn)) {
      setCategoryNameError(dictionary.catalogCategoryMutationFailed);
      return;
    }
    if ([...namePtBr].length > MAX_CATEGORY_NAME || [...nameEn].length > MAX_CATEGORY_NAME) {
      setCategoryNameError(dictionary.catalogCategoryNameTooLong);
      return;
    }
    setCategoryNameError("");
    setCategoryPending(true);
    try {
      const response = await fetch("/product-categories", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new URLSearchParams({ action: "create", namePtBr, nameEn }),
      });
      if (!response.ok) throw new Error("category unavailable");
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null || !("id" in result) ||
        !("namePtBr" in result) || !("nameEn" in result) || typeof result.id !== "string" ||
        typeof result.namePtBr !== "string" || typeof result.nameEn !== "string") {
        throw new Error("category unavailable");
      }
      const createdCategory = { id: result.id, namePtBr: result.namePtBr, nameEn: result.nameEn };
      setCategoryOptions((current) => [...current, createdCategory]);
      setSelectedCategory(result.id);
      setCategoryNamePtBr("");
      setCategoryNameEn("");
      setCategoryOpen(false);
    } catch {
      showToast({ kind: "error", message: dictionary.catalogCategoryMutationFailed });
    } finally {
      setCategoryPending(false);
    }
  }

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

  const canonicalPrice = canonicalBrlInput(price);
  const suppliedTitlePtBr = titlePtBr.trim();
  const suppliedTitleEn = titleEn.trim();
  const suppliedDescriptionPtBr = descriptionPtBr.trim();
  const suppliedDescriptionEn = descriptionEn.trim();
  const previewTitle = locale === "pt-BR" ? suppliedTitlePtBr || suppliedTitleEn : suppliedTitleEn || suppliedTitlePtBr;
  const previewDescription = locale === "pt-BR"
    ? suppliedDescriptionPtBr || suppliedDescriptionEn
    : suppliedDescriptionEn || suppliedDescriptionPtBr;

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
              maxLength={MAX_INTERNAL_NAME * 2}
              onChange={(event) => {
                if ([...event.target.value.trim()].length <= MAX_INTERNAL_NAME) setInternalName(event.target.value);
              }}
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
            maxCodePoints={MAX_TITLE}
            groupLabel={dictionary.catalogProductTitleGroupLabel}
            id={`${formId}-title`}
            onValueChange={(fieldLocale, value) => {
              if (fieldLocale === "pt-BR") setTitlePtBr(value);
              else setTitleEn(value);
            }}
          />

          <LocalizedFieldGroup
            disabled={readOnly}
            fields={{
              "pt-BR": {
                localeLabel: "PT-BR",
                label: dictionary.adminProductDescriptionPtBr,
                value: descriptionPtBr,
                error: errors.descriptionPtBr,
              },
              en: {
                localeLabel: "EN",
                label: dictionary.adminProductDescriptionEn,
                value: descriptionEn,
                error: errors.descriptionEn,
              },
            }}
            groupLabel={dictionary.catalogProductDescriptionGroupLabel}
            maxCodePoints={MAX_DESCRIPTION}
            id={`${formId}-description`}
            multiline
            onValueChange={(fieldLocale, value) => {
              if (fieldLocale === "pt-BR") setDescriptionPtBr(value);
              else setDescriptionEn(value);
            }}
          />
        <FieldDescription>{dictionary.catalogProductLocaleHelp}</FieldDescription>
        </FieldGroup>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.price)}>
            <FieldLabel htmlFor={`${formId}-price`}>{dictionary.adminProductPrice}</FieldLabel>
            <BrlAmountInput
              disabled={Boolean(readOnly)}
              id={`${formId}-price`}
              invalid={Boolean(errors.price)}
              onChange={setPrice}
              placeholder="R$ 0,00"
              required={false}
              value={price}
            />
            <FieldDescription>{dictionary.adminProductPriceHelp}</FieldDescription>
            {errors.price ? <FieldError>{errors.price}</FieldError> : null}
          </Field>
          <CurrencyField
            choices={choices}
            dictionary={dictionary}
            formId={formId}
            onSelectedCurrencyChange={(code) => {
              setSelectedCurrency(code);
              setCurrencyTouched(true);
            }}
            readOnly={readOnly}
            stored={product?.currencyCode ?? preselectedCurrencyCode}
          />
          {creating && !currencyTouched ? (
            <Input name="currencyCode" type="hidden" value={selectedCurrency ?? ""} />
          ) : null}
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${formId}-category`}>{dictionary.catalogProductCategoryLabel}</FieldLabel>
            <NativeSelect
              disabled={readOnly || categoryOptions.length === 0}
              id={`${formId}-category`}
              onChange={(event) => setSelectedCategory(event.target.value)}
              value={selectedCategory}
            >
              <NativeSelectOption value="">{dictionary.catalogProductCategoryNone}</NativeSelectOption>
              {categoryOptions.map((category) => (
                <NativeSelectOption key={category.id} value={category.id}>
                  {category.namePtBr} / {category.nameEn}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {categoryOptions.length === 0 ? <Banner tone="info">{dictionary.catalogProductNoCategory}</Banner> : null}
            {!readOnly ? (
              <Button onClick={() => setCategoryOpen(true)} type="button" variant="outline">
                <Plus aria-hidden data-icon="inline-start" />
                {dictionary.catalogProductCategoryCreateInline}
              </Button>
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
        price={canonicalPrice}
        title={previewTitle}
      />
    </div>
  );

  if (readOnly) {
    return <div id={formId}>{fields}</div>;
  }

  return (
    <>
    <form
      action="/products"
      id={formId}
      method="post"
      onSubmit={(event) => {
        const validationErrors = validateProductForm({
          internalName, titlePtBr, titleEn, descriptionPtBr, descriptionEn, price: canonicalPrice,
        }, dictionary);
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
          price: canonicalPrice,
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
      <Input name="titlePtBr" type="hidden" value={suppliedTitlePtBr || suppliedTitleEn} />
      <Input name="titleEn" type="hidden" value={suppliedTitleEn || suppliedTitlePtBr} />
      <Input name="descriptionPtBr" type="hidden" value={suppliedDescriptionPtBr || suppliedDescriptionEn} />
      <Input name="descriptionEn" type="hidden" value={suppliedDescriptionEn || suppliedDescriptionPtBr} />
      <Input name="price" type="hidden" value={canonicalPrice} />
      {selectedCategory !== (product?.categoryId ?? "") ? <Input name="categoryId" type="hidden" value={selectedCategory} /> : null}
      {imageDirty ? <Input name="imageMediaId" type="hidden" value={imageMediaId ?? ""} /> : null}
      {fields}
      {creating ? (
        <div className="mt-5 flex justify-end">
          <CatalogSubmit form={formId} label={dictionary.adminProductCreate} />
        </div>
      ) : null}
    </form>
    <Modal
      closeLabel={dictionary.close}
      description={dictionary.catalogProductCategoryCreateDescription}
      dismissible={!categoryPending}
      footer={
        <>
          <Button disabled={categoryPending} onClick={() => setCategoryOpen(false)} type="button" variant="ghost">
            {dictionary.cancel}
          </Button>
          <Button disabled={categoryPending} form={`${formId}-category-create`} type="submit">
            {categoryPending ? dictionary.loading : dictionary.catalogCategoryCreate}
          </Button>
        </>
      }
      onOpenChange={setCategoryOpen}
      open={categoryOpen}
      title={dictionary.catalogCategoryCreateHeading}
    >
      <form className="space-y-4" id={`${formId}-category-create`} onSubmit={createCategory}>
        <FieldGroup>
          <Field data-invalid={Boolean(categoryNameError)}>
            <FieldLabel htmlFor={`${formId}-category-pt-br`}>{dictionary.catalogCategoryNamePtBr}</FieldLabel>
            <Input
              aria-invalid={Boolean(categoryNameError)}
              disabled={categoryPending}
              id={`${formId}-category-pt-br`}
              maxLength={MAX_CATEGORY_NAME * 2}
              onChange={(event) => {
                if ([...event.target.value.trim()].length <= MAX_CATEGORY_NAME) setCategoryNamePtBr(event.target.value);
              }}
              required
              value={categoryNamePtBr}
            />
          </Field>
          <Field data-invalid={Boolean(categoryNameError)}>
            <FieldLabel htmlFor={`${formId}-category-en`}>{dictionary.catalogCategoryNameEn}</FieldLabel>
            <Input
              aria-invalid={Boolean(categoryNameError)}
              disabled={categoryPending}
              id={`${formId}-category-en`}
              maxLength={MAX_CATEGORY_NAME * 2}
              onChange={(event) => {
                if ([...event.target.value.trim()].length <= MAX_CATEGORY_NAME) setCategoryNameEn(event.target.value);
              }}
              required
              value={categoryNameEn}
            />
          </Field>
          {categoryNameError ? <FieldError role="alert">{categoryNameError}</FieldError> : null}
        </FieldGroup>
      </form>
    </Modal>
    </>
  );
}

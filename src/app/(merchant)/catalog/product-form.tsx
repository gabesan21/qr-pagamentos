import type { OwnerProduct } from "@/auth/product";
import type { OwnerProductCategory } from "@/auth/product-category";
import type { ExchangeCurrencyChoice } from "@/auth/supported-exchange-currency";
import { BrandIdentity } from "@/brand/brand-identity";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { getDictionary } from "@/i18n/dictionaries";

import { CatalogSubmit } from "./catalog-submit";
import { DirtySelect } from "./dirty-select";
import { ProductImageField } from "./product-image-field";

type Dictionary = ReturnType<typeof getDictionary>;

function CurrencyField({
  choices,
  dictionary,
  formId,
  product,
}: Readonly<{
  choices: readonly ExchangeCurrencyChoice[];
  dictionary: Dictionary;
  formId: string;
  product?: OwnerProduct;
}>) {
  const stored = product?.currencyCode ?? null;
  if (choices.length === 0) {
    return (
      <>
        {stored ? (
          <Field>
            <FieldLabel htmlFor={`${formId}-currency-stored`}>{dictionary.catalogProductCurrencyStored}</FieldLabel>
            <Input disabled id={`${formId}-currency-stored`} value={stored} />
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor={`${formId}-currency`}>{dictionary.catalogProductCurrencyLabel}</FieldLabel>
            <DirtySelect disabled fieldName="currencyCode" id={`${formId}-currency`}>
              <NativeSelectOption value="">{dictionary.catalogProductCurrencyNone}</NativeSelectOption>
            </DirtySelect>
          </Field>
        )}
        <Alert variant="warning">
          <AlertTitle>{dictionary.catalogProductCurrencyUnavailable}</AlertTitle>
          <AlertDescription>{dictionary.catalogProductCurrencyUnavailableDescription}</AlertDescription>
        </Alert>
      </>
    );
  }
  const mapped = choices.some((choice) => choice.code === stored);
  return (
    <>
      {stored && !mapped ? (
        <Field>
          <FieldLabel htmlFor={`${formId}-currency-stored`}>{dictionary.catalogProductCurrencyStored}</FieldLabel>
          <Input disabled id={`${formId}-currency-stored`} value={stored} />
        </Field>
      ) : null}
      <Field>
        <FieldLabel htmlFor={`${formId}-currency`}>{dictionary.catalogProductCurrencyLabel}</FieldLabel>
        <DirtySelect defaultValue={mapped && stored ? stored : ""} fieldName="currencyCode" id={`${formId}-currency`}>
          <NativeSelectOption value="">{dictionary.catalogProductCurrencyNone}</NativeSelectOption>
          {choices.map((choice) => (
            <NativeSelectOption key={choice.code} value={choice.code}>{choice.code} — {choice.label}</NativeSelectOption>
          ))}
        </DirtySelect>
      </Field>
    </>
  );
}

export function ProductForm({
  categories,
  choices,
  dictionary,
  formId,
  product,
}: Readonly<{
  categories: readonly OwnerProductCategory[];
  choices: readonly ExchangeCurrencyChoice[];
  dictionary: Dictionary;
  formId: string;
  product?: OwnerProduct;
}>) {
  const creating = !product;
  const activeCategories = categories.filter((category) => category.active);

  return (
    <form action="/products" id={formId} method="post">
      <Input name="action" type="hidden" value={creating ? "create" : "update"} />
      {product ? (
        <>
          <Input name="id" type="hidden" value={product.id} />
          <Input name="version" type="hidden" value={product.version} />
        </>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${formId}-internal-name`}>{dictionary.adminProductInternalName}</FieldLabel>
          <Input defaultValue={product?.internalName} id={`${formId}-internal-name`} name="internalName" required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-title-pt-br`}>{dictionary.adminProductTitlePtBr}</FieldLabel>
          <Input defaultValue={product?.titlePtBr} id={`${formId}-title-pt-br`} name="titlePtBr" required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-description-pt-br`}>{dictionary.adminProductDescriptionPtBr}</FieldLabel>
          <Textarea defaultValue={product?.descriptionPtBr} id={`${formId}-description-pt-br`} name="descriptionPtBr" required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-title-en`}>{dictionary.adminProductTitleEn}</FieldLabel>
          <Input defaultValue={product?.titleEn} id={`${formId}-title-en`} name="titleEn" required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-description-en`}>{dictionary.adminProductDescriptionEn}</FieldLabel>
          <Textarea defaultValue={product?.descriptionEn} id={`${formId}-description-en`} name="descriptionEn" required />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-price`}>{dictionary.adminProductPrice}</FieldLabel>
          <Input aria-describedby={`${formId}-price-help`} defaultValue={product?.price} id={`${formId}-price`} inputMode="decimal" name="price" required />
          <FieldDescription id={`${formId}-price-help`}>{dictionary.adminProductPriceHelp}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-category`}>{dictionary.catalogProductCategoryLabel}</FieldLabel>
          <DirtySelect defaultValue={product?.categoryId ?? ""} fieldName="categoryId" id={`${formId}-category`}>
            <NativeSelectOption value="">{dictionary.catalogProductCategoryNone}</NativeSelectOption>
            {activeCategories.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>{category.namePtBr} / {category.nameEn}</NativeSelectOption>
            ))}
          </DirtySelect>
        </Field>
        <CurrencyField choices={choices} dictionary={dictionary} formId={formId} product={product} />
        <Field>
          <FieldLabel htmlFor={`${formId}-image`}>{dictionary.catalogProductImageLabel}</FieldLabel>
          <ProductImageField
            copy={{
              alt: dictionary.catalogProductImageAlt,
              failed: dictionary.catalogProductImageFailed,
              failedTitle: dictionary.adminErrorHeading,
              remove: dictionary.catalogProductImageRemove,
              replace: dictionary.catalogProductImageReplace,
              upload: dictionary.catalogProductImageUpload,
              uploading: dictionary.catalogProductImageUploading,
            }}
            initialIdentifier={product?.imageMediaId ?? null}
            inputId={`${formId}-image`}
            placeholder={<BrandIdentity variant="merchant-fallback" />}
          />
          <FieldDescription id={`${formId}-image-help`}>{dictionary.catalogProductImageHelp}</FieldDescription>
        </Field>
        <CatalogSubmit form={formId} label={creating ? dictionary.adminProductCreate : dictionary.adminProductSave} />
      </FieldGroup>
    </form>
  );
}

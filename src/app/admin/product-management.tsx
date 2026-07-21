"use client";

import { useEffect, useState } from "react";

import type { OwnerProduct } from "@/auth/product";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

type Dictionary = ReturnType<typeof getDictionary>;

export function formatProductPrice(price: string, locale: SupportedLocale) {
  const [integer, fraction] = price.split(".");
  const grouping = locale === "pt-BR" ? "." : ",";
  const decimal = locale === "pt-BR" ? "," : ".";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, grouping);
  return locale === "pt-BR"
    ? `R$ ${grouped}${fraction ? `${decimal}${fraction}` : ""}`
    : `BRL ${grouped}${fraction ? `${decimal}${fraction}` : ""}`;
}

export function OwnerProductManagement({ dictionary, locale, products }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; products: OwnerProduct[] }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.adminProductsHeading}</CardTitle><CardDescription>{dictionary.adminProductsDescription}</CardDescription></CardHeader>
      <CardContent>
        <ProductFields dictionary={dictionary} formId="product-create" />
        <Separator />
        {products.length === 0 ? (
          <Alert><AlertTitle>{dictionary.adminProductsEmpty}</AlertTitle><AlertDescription>{dictionary.adminProductsEmptyDescription}</AlertDescription></Alert>
        ) : (
          <div className="admin-product-list" role="list">
            {products.map((product) => <Product dictionary={dictionary} key={product.id} locale={locale} product={product} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductFields({ dictionary, formId, product }: Readonly<{ dictionary: Dictionary; formId: string; product?: OwnerProduct }>) {
  const creating = !product;
  return (
    <form action="/products" id={formId} method="post">
      <Input name="action" type="hidden" value={creating ? "create" : "update"} />
      {product ? <><Input name="id" type="hidden" value={product.id} /><Input name="version" type="hidden" value={product.version} /></> : null}
      <FieldGroup>
        <Field><FieldLabel htmlFor={`${formId}-internal-name`}>{dictionary.adminProductInternalName}</FieldLabel><Input defaultValue={product?.internalName} id={`${formId}-internal-name`} name="internalName" required /></Field>
        <Field><FieldLabel htmlFor={`${formId}-title-pt-br`}>{dictionary.adminProductTitlePtBr}</FieldLabel><Input defaultValue={product?.titlePtBr} id={`${formId}-title-pt-br`} name="titlePtBr" required /></Field>
        <Field><FieldLabel htmlFor={`${formId}-description-pt-br`}>{dictionary.adminProductDescriptionPtBr}</FieldLabel><Textarea defaultValue={product?.descriptionPtBr} id={`${formId}-description-pt-br`} name="descriptionPtBr" required /></Field>
        <Field><FieldLabel htmlFor={`${formId}-title-en`}>{dictionary.adminProductTitleEn}</FieldLabel><Input defaultValue={product?.titleEn} id={`${formId}-title-en`} name="titleEn" required /></Field>
        <Field><FieldLabel htmlFor={`${formId}-description-en`}>{dictionary.adminProductDescriptionEn}</FieldLabel><Textarea defaultValue={product?.descriptionEn} id={`${formId}-description-en`} name="descriptionEn" required /></Field>
        <Field><FieldLabel htmlFor={`${formId}-price`}>{dictionary.adminProductPrice}</FieldLabel><Input aria-describedby={`${formId}-price-help`} defaultValue={product?.price} id={`${formId}-price`} inputMode="decimal" name="price" required /><FieldDescription id={`${formId}-price-help`}>{dictionary.adminProductPriceHelp}</FieldDescription></Field>
        <ProductSubmit form={formId} label={creating ? dictionary.adminProductCreate : dictionary.adminProductSave} />
      </FieldGroup>
    </form>
  );
}

function Product({ dictionary, locale, product }: Readonly<{ dictionary: Dictionary; locale: SupportedLocale; product: OwnerProduct }>) {
  const activeFormId = `product-${product.id}-active`;
  const deleteFormId = `product-${product.id}-delete`;
  return (
    <section aria-labelledby={`product-${product.id}`} className="admin-product" role="listitem">
      <div className="admin-product__facts">
        <h3 id={`product-${product.id}`}>{product.internalName}</h3>
        <Badge variant={product.active ? "secondary" : "destructive"}>{product.active ? dictionary.adminActive : dictionary.adminDisabled}</Badge>
        <dl>
          <div><dt>{dictionary.adminProductPublicPtBr}</dt><dd>{product.titlePtBr}</dd></div>
          <div><dt>{dictionary.adminProductPublicEn}</dt><dd>{product.titleEn}</dd></div>
          <div><dt>{dictionary.adminProductPrice}</dt><dd>{formatProductPrice(product.price, locale)}</dd></div>
        </dl>
        <p className="admin-product-description">{locale === "pt-BR" ? product.descriptionPtBr : product.descriptionEn}</p>
      </div>
      <ProductFields dictionary={dictionary} formId={`product-${product.id}`} product={product} />
      <form action="/products" id={activeFormId} method="post">
        <Input name="action" type="hidden" value="active" /><Input name="id" type="hidden" value={product.id} /><Input name="version" type="hidden" value={product.version} /><Input name="active" type="hidden" value={String(!product.active)} />
        <ProductSubmit form={activeFormId} label={product.active ? dictionary.adminProductDeactivate : dictionary.adminProductReactivate} tone="secondary" />
      </form>
      <form action="/products" id={deleteFormId} method="post">
        <Input name="action" type="hidden" value="delete" /><Input name="id" type="hidden" value={product.id} /><Input name="version" type="hidden" value={product.version} />
        <details>
          <summary>{dictionary.adminProductDeleteHeading}</summary>
          <Alert variant="warning">
            <AlertTitle>{dictionary.adminProductDeleteConfirm}</AlertTitle>
            <AlertDescription>{dictionary.adminProductDeleteDescription}</AlertDescription>
            <ProductSubmit form={deleteFormId} label={dictionary.adminProductDelete} tone="secondary" />
          </Alert>
        </details>
      </form>
    </section>
  );
}

function ProductSubmit({ form, label, tone = "primary" }: Readonly<{ form: string; label: string; tone?: "primary" | "secondary" }>) {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const nativeForm = document.getElementById(form);
    if (!(nativeForm instanceof HTMLFormElement)) return;
    const observeNativeSubmit = () => setPending(true);
    nativeForm.addEventListener("submit", observeNativeSubmit);
    return () => nativeForm.removeEventListener("submit", observeNativeSubmit);
  }, [form]);

  return (
    <Button aria-busy={pending || undefined} disabled={pending} form={form} type="submit" variant={tone === "secondary" ? "outline" : "default"}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {label}
    </Button>
  );
}

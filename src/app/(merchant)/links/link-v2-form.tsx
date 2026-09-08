"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SupportedLocale } from "@/i18n/locales";

import { CatalogSubmit } from "../catalog/catalog-submit";
import { DirtyInput } from "./dirty-input";
import { LinkLinesEditor, type LinkLineProduct, type LinkLineValue } from "./link-lines-editor";

// One client form serves both V2 link flows. Create posts the delivered field
// grammar to `/payment-links-v2` with the immutable kind/type/pair selects and
// renders exactly the section of the chosen kind, so the other kind's members
// never post. Edit posts `action=edit` plus the prefilled `version` CAS to
// `/payment-links-v2/[id]` and names every financial member only after a real
// change (absent = unchanged, so untouched compositions never trip the
// checkout-attempt gate). Kind, type, and pair are immutable after creation
// and stay read-only facts on the edit page.

export type LinkV2FormPair = Readonly<{ id: string; label: string }>;

export type LinkV2FormCopy = Readonly<{
  composition: string;
  kindProductLines: string;
  kindFixedAmount: string;
  currencyPair: string;
  chooseCurrencyPair: string;
  linkType: string;
  singleUse: string;
  reusable: string;
  expiry: string;
  expiryHelp: string;
  descriptionPtBr: string;
  descriptionEn: string;
  descriptionHelp: string;
  amount: string;
  amountHelp: string;
  lines: string;
  lineProduct: string;
  chooseProduct: string;
  lineQuantity: string;
  lineAdd: string;
  lineRemove: string;
  submit: string;
  productsUnavailable: string;
  productsUnavailableDescription: string;
  pairsUnavailable: string;
  pairsUnavailableDescription: string;
}>;

function FixedAmountFields({
  copy,
  formId,
  omitUntilDirty,
  values,
}: Readonly<{
  copy: LinkV2FormCopy;
  formId: string;
  omitUntilDirty: boolean;
  values?: Readonly<{ descriptionPtBr: string; descriptionEn: string; amount: string }>;
}>) {
  // The service validates the three fixed-amount members together, so one
  // shared dirty gate names all of them after the first real change.
  const [dirty, setDirty] = useState(false);
  const fieldName = (name: string) => omitUntilDirty && !dirty ? undefined : name;
  const markDirty = () => setDirty(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.amount}</CardTitle>
        <CardDescription>{copy.descriptionHelp}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor={`${formId}-description-pt-br`}>{copy.descriptionPtBr}</FieldLabel>
          <Input
            defaultValue={values?.descriptionPtBr}
            id={`${formId}-description-pt-br`}
            maxLength={160}
            name={fieldName("descriptionPtBr")}
            onChange={markDirty}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-description-en`}>{copy.descriptionEn}</FieldLabel>
          <Input
            aria-describedby={`${formId}-description-help`}
            defaultValue={values?.descriptionEn}
            id={`${formId}-description-en`}
            maxLength={160}
            name={fieldName("descriptionEn")}
            onChange={markDirty}
            required
          />
          <FieldDescription id={`${formId}-description-help`}>{copy.descriptionHelp}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-amount`}>{copy.amount}</FieldLabel>
          <Input
            aria-describedby={`${formId}-amount-help`}
            defaultValue={values?.amount}
            id={`${formId}-amount`}
            inputMode="decimal"
            name={fieldName("amount")}
            onChange={markDirty}
            required
          />
          <FieldDescription id={`${formId}-amount-help`}>{copy.amountHelp}</FieldDescription>
        </Field>
      </CardContent>
    </Card>
  );
}

export function LinkV2Form({
  action,
  copy,
  formId,
  from,
  initialAmount,
  initialDescriptionEn,
  initialDescriptionPtBr,
  initialExpiresAt,
  initialKind,
  initialLines,
  initialLinkType,
  locale,
  mode,
  pairs,
  products,
  version,
}: Readonly<{
  action: string;
  copy: LinkV2FormCopy;
  formId: string;
  from?: string;
  initialAmount?: string;
  initialDescriptionEn?: string;
  initialDescriptionPtBr?: string;
  initialExpiresAt?: string;
  initialKind?: "PRODUCT_LINES" | "FIXED_AMOUNT";
  initialLines?: readonly LinkLineValue[];
  initialLinkType?: "SINGLE_USE" | "REUSABLE";
  locale: SupportedLocale;
  mode: "create" | "edit";
  pairs: readonly LinkV2FormPair[];
  products: readonly LinkLineProduct[];
  version?: number;
}>) {
  const editing = mode === "edit";
  const [kind, setKind] = useState<"PRODUCT_LINES" | "FIXED_AMOUNT">(initialKind ?? "PRODUCT_LINES");
  const noPairs = pairs.length === 0;
  const noProducts = products.length === 0;
  const submitDisabled = !editing && (noPairs || (kind === "PRODUCT_LINES" && noProducts));

  return (
    <form action={action} id={formId} method="post">
      {editing ? (
        <>
          <Input name="action" type="hidden" value="edit" />
          <Input name="version" type="hidden" value={version ?? 0} />
        </>
      ) : null}
      {!editing && from !== undefined ? <Input name="from" type="hidden" value={from} /> : null}
      <FieldGroup className="space-y-4">
        {editing ? null : (
          <Card>
            <CardHeader>
              <CardTitle>{copy.composition}</CardTitle>
              <CardDescription>{copy.currencyPair}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field>
                <FieldLabel htmlFor={`${formId}-kind`}>{copy.composition}</FieldLabel>
                <NativeSelect id={`${formId}-kind`} name="compositionKind" onChange={(event) => setKind(event.target.value === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "PRODUCT_LINES")} value={kind}>
                  <NativeSelectOption value="PRODUCT_LINES">{copy.kindProductLines}</NativeSelectOption>
                  <NativeSelectOption value="FIXED_AMOUNT">{copy.kindFixedAmount}</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-pair`}>{copy.currencyPair}</FieldLabel>
                <NativeSelect defaultValue="" disabled={noPairs} id={`${formId}-pair`} name="currencyPairId" required>
                  <NativeSelectOption disabled value="">{copy.chooseCurrencyPair}</NativeSelectOption>
                  {pairs.map((pair) => (
                    <NativeSelectOption key={pair.id} value={pair.id}>{pair.label}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-type`}>{copy.linkType}</FieldLabel>
                <NativeSelect defaultValue={initialLinkType ?? "REUSABLE"} id={`${formId}-type`} name="linkType" required>
                  <NativeSelectOption value="REUSABLE">{copy.reusable}</NativeSelectOption>
                  <NativeSelectOption value="SINGLE_USE">{copy.singleUse}</NativeSelectOption>
                </NativeSelect>
              </Field>
              {noPairs ? (
                <Alert variant="warning">
                  <AlertTitle>{copy.pairsUnavailable}</AlertTitle>
                  <AlertDescription>{copy.pairsUnavailableDescription}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>{copy.expiry}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel htmlFor={`${formId}-expiry`}>{copy.expiry}</FieldLabel>
              {editing ? (
                <DirtyInput aria-describedby={`${formId}-expiry-help`} defaultValue={initialExpiresAt ?? ""} fieldName="expiresAt" id={`${formId}-expiry`} type="datetime-local" />
              ) : (
                <Input aria-describedby={`${formId}-expiry-help`} id={`${formId}-expiry`} name="expiresAt" type="datetime-local" />
              )}
              <FieldDescription id={`${formId}-expiry-help`}>{copy.expiryHelp}</FieldDescription>
            </Field>
          </CardContent>
        </Card>
        {kind === "PRODUCT_LINES" ? (
          <FieldSet>
            <FieldLegend>{copy.lines}</FieldLegend>
            {noProducts && !editing ? (
              <Alert variant="warning">
                <AlertTitle>{copy.productsUnavailable}</AlertTitle>
                <AlertDescription>{copy.productsUnavailableDescription}</AlertDescription>
              </Alert>
            ) : (
              <LinkLinesEditor
                copy={{ add: copy.lineAdd, chooseProduct: copy.chooseProduct, product: copy.lineProduct, quantity: copy.lineQuantity, remove: copy.lineRemove }}
                fieldName="lines"
                formId={formId}
                {...(initialLines ? { initialLines } : {})}
                locale={locale}
                omitUntilDirty={editing}
                products={products}
              />
            )}
          </FieldSet>
        ) : (
          <FixedAmountFields
            copy={copy}
            formId={formId}
            omitUntilDirty={editing}
            {...(initialDescriptionPtBr !== undefined && initialDescriptionEn !== undefined && initialAmount !== undefined
              ? { values: { descriptionPtBr: initialDescriptionPtBr, descriptionEn: initialDescriptionEn, amount: initialAmount } }
              : {})}
          />
        )}
        <CatalogSubmit disabled={submitDisabled} form={formId} label={copy.submit} />
      </FieldGroup>
    </form>
  );
}

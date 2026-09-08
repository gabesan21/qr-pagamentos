"use client";

import { useEffect, useState } from "react";

import { clearFormDraft, hasFailureNotice, readFormDraft, saveFormDraft } from "@/app/form-draft";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SupportedLocale } from "@/i18n/locales";

import { CatalogSubmit } from "../catalog/catalog-submit";
import { LINKS_NOTICE_KEY } from "./directory-query";
import { LinkLinesEditor, type LinkLineProduct, type LinkLineValue } from "./link-lines-editor";

// The description/amount/expiry fields are named only after the merchant
// dirties them (see `fieldName` below), and the composition kind is a select
// that only exists on the create page — so a plain DOM-name lookup right
// after a failure redirect (`FormDraftGuard`) can never see them. This form
// owns its restore instead: it reads/writes the same session draft directly
// against its own controlled state, following the precedent in
// `catalog/product-form.tsx`.
const LINK_DRAFT_FAILURE_NOTICES = ["failed"] as const;

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
  amount,
  copy,
  descriptionEn,
  descriptionPtBr,
  dirty,
  formId,
  omitUntilDirty,
  onChange,
}: Readonly<{
  amount: string;
  copy: LinkV2FormCopy;
  descriptionEn: string;
  descriptionPtBr: string;
  dirty: boolean;
  formId: string;
  omitUntilDirty: boolean;
  onChange: (field: "descriptionPtBr" | "descriptionEn" | "amount", value: string) => void;
}>) {
  // The service validates the three fixed-amount members together, so one
  // shared dirty gate (owned by `LinkV2Form`, so a session-draft restore can
  // force it) names all of them after the first real change.
  const fieldName = (name: string) => omitUntilDirty && !dirty ? undefined : name;

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
            id={`${formId}-description-pt-br`}
            maxLength={160}
            name={fieldName("descriptionPtBr")}
            onChange={(event) => onChange("descriptionPtBr", event.target.value)}
            required
            value={descriptionPtBr}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-description-en`}>{copy.descriptionEn}</FieldLabel>
          <Input
            aria-describedby={`${formId}-description-help`}
            id={`${formId}-description-en`}
            maxLength={160}
            name={fieldName("descriptionEn")}
            onChange={(event) => onChange("descriptionEn", event.target.value)}
            required
            value={descriptionEn}
          />
          <FieldDescription id={`${formId}-description-help`}>{copy.descriptionHelp}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-amount`}>{copy.amount}</FieldLabel>
          <Input
            aria-describedby={`${formId}-amount-help`}
            id={`${formId}-amount`}
            inputMode="decimal"
            name={fieldName("amount")}
            onChange={(event) => onChange("amount", event.target.value)}
            required
            value={amount}
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
  const [fixedDescriptionPtBr, setFixedDescriptionPtBr] = useState(initialDescriptionPtBr ?? "");
  const [fixedDescriptionEn, setFixedDescriptionEn] = useState(initialDescriptionEn ?? "");
  const [fixedAmount, setFixedAmount] = useState(initialAmount ?? "");
  const [fixedDirty, setFixedDirty] = useState(false);
  const [expiresAtValue, setExpiresAtValue] = useState(initialExpiresAt ?? "");
  const [expiresAtDirty, setExpiresAtDirty] = useState(false);
  const noPairs = pairs.length === 0;
  const noProducts = products.length === 0;
  const submitDisabled = !editing && (noPairs || (kind === "PRODUCT_LINES" && noProducts));

  // Edit posts `/payment-links-v2/<id>`, so the trailing segment scopes the
  // draft per link the same way the order comment/outcome drafts scope by
  // order id; create has a single fixed key.
  const draftKey = editing ? `payment-link-v2-edit:${action.slice(action.lastIndexOf("/") + 1)}` : "payment-link-v2-create";

  useEffect(() => {
    if (!hasFailureNotice(LINKS_NOTICE_KEY, LINK_DRAFT_FAILURE_NOTICES)) {
      clearFormDraft(draftKey);
      return;
    }
    const draft = readFormDraft(draftKey);
    if (!draft) return;
    // sessionStorage is a client-only external system unavailable during the
    // server render, so seeding these fields cannot happen before mount.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!editing && (draft.compositionKind === "PRODUCT_LINES" || draft.compositionKind === "FIXED_AMOUNT")) {
      setKind(draft.compositionKind);
    }
    if (typeof draft.descriptionPtBr === "string") setFixedDescriptionPtBr(draft.descriptionPtBr);
    if (typeof draft.descriptionEn === "string") setFixedDescriptionEn(draft.descriptionEn);
    if (typeof draft.amount === "string") setFixedAmount(draft.amount);
    if (draft.descriptionPtBr !== undefined || draft.descriptionEn !== undefined || draft.amount !== undefined) {
      setFixedDirty(true);
    }
    if (typeof draft.expiresAt === "string") {
      setExpiresAtValue(draft.expiresAt);
      if (editing) setExpiresAtDirty(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    clearFormDraft(draftKey);
  }, [draftKey, editing]);

  const handleSubmit = () => {
    const draft: Record<string, string> = {
      amount: fixedAmount,
      descriptionEn: fixedDescriptionEn,
      descriptionPtBr: fixedDescriptionPtBr,
      expiresAt: expiresAtValue,
    };
    if (!editing) draft.compositionKind = kind;
    saveFormDraft(draftKey, draft);
  };

  return (
    <form action={action} id={formId} method="post" onSubmit={handleSubmit}>
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
              <Input
                aria-describedby={`${formId}-expiry-help`}
                id={`${formId}-expiry`}
                name={editing && !expiresAtDirty ? undefined : "expiresAt"}
                onChange={(event) => {
                  setExpiresAtDirty(true);
                  setExpiresAtValue(event.target.value);
                }}
                type="datetime-local"
                value={expiresAtValue}
              />
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
            amount={fixedAmount}
            copy={copy}
            descriptionEn={fixedDescriptionEn}
            descriptionPtBr={fixedDescriptionPtBr}
            dirty={fixedDirty}
            formId={formId}
            omitUntilDirty={editing}
            onChange={(field, value) => {
              setFixedDirty(true);
              if (field === "descriptionPtBr") setFixedDescriptionPtBr(value);
              else if (field === "descriptionEn") setFixedDescriptionEn(value);
              else setFixedAmount(value);
            }}
          />
        )}
        <CatalogSubmit disabled={submitDisabled} form={formId} label={copy.submit} />
      </FieldGroup>
    </form>
  );
}

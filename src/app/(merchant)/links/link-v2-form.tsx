"use client";

import { useEffect, useState } from "react";
import { LockIcon, XIcon } from "lucide-react";

import { clearFormDraft, hasFailureNotice, readFormDraft, saveFormDraft } from "@/app/form-draft";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SupportedLocale } from "@/i18n/locales";

import { formatCatalogPrice } from "../catalog/price-format";
import { CatalogSubmit } from "../catalog/catalog-submit";
import { isLinkMoneyAmount } from "./link-money";
import {
  initialEditorLines,
  linkLinesTotal,
  LinkLinesEditor,
  type LinkLineProduct,
  type LinkLinesEditorLine,
  type LinkLineValue,
} from "./link-lines-editor";

// `./directory-query` starts with `import "server-only"`, so this client
// component keeps its own copy of the notice key instead of importing it
// (precedent: `catalog/product-form.tsx` `PRODUCT_NOTICE_KEY`,
// `orders/order-v2-views.tsx` `ORDER_V2_NOTICE_KEY`) — must match the
// `LINKS_NOTICE_KEY` value in `./directory-query`.
const LINKS_NOTICE_KEY = "payment-links-v2";

// The description/amount/expiry fields are named only after the merchant
// dirties them (see `fieldName` below), and the composition kind is a radio
// group that only exists on the create page — so a plain DOM-name lookup
// right after a failure redirect (`FormDraftGuard`) can never see them. This
// form owns its restore instead: it reads/writes the same session draft
// directly against its own controlled state, following the precedent in
// `catalog/product-form.tsx`.
const LINK_DRAFT_FAILURE_NOTICES = ["failed"] as const;

// One client form serves both V2 link flows. Create posts the delivered field
// grammar to `/payment-links-v2` with the immutable kind/type/pair radio
// cards and select, and renders exactly the section of the chosen kind, so
// the other kind's members never post. Edit posts `action=edit` plus the
// prefilled `version` CAS to `/payment-links-v2/[id]` and names every
// financial member only after a real change (absent = unchanged, so
// untouched compositions never trip the checkout-attempt gate). Kind, type,
// and pair are immutable after creation and always render as read-only
// facts on the edit page; the composition-value fields (description,
// amount, lines) additionally disable themselves and show a lock note only
// once `financiallyLocked` is true (a checkout attempt genuinely exists,
// read through the owner prefill seam by the page).
//
// Descriptions render for every composition (14.5.2 decision 2): a
// `PRODUCT_LINES` link never stores one, so its fields render disabled and
// empty with an explanatory caption instead of posting a value.
//
// Deviation from the `LocalizedFieldGroup` primitive named in the front
// file: that component renders its `Input`/`Textarea` with no `name`
// attribute, so it cannot post a value without JavaScript. Every control
// here keeps submitting without JS (a hard 14.3.2 carry-over), so the
// description fields stay the plain named `Input`s this form already used —
// recorded for F04 as a UI-primitive gap, not a silent substitution.

export type LinkV2FormPair = Readonly<{ id: string; label: string }>;

export type LinkV2FormCopy = Readonly<{
  add: string;
  alreadyAdded: string;
  amount: string;
  amountHelp: string;
  amountInvalid: string;
  chooseCurrencyPair: string;
  chooseProduct: string;
  composition: string;
  compositionFixedAmountCaption: string;
  compositionProductLinesCaption: string;
  conflictBody: string;
  conflictReload: string;
  conflictRetry: string;
  conflictTitle: string;
  currencyPair: string;
  descriptionEn: string;
  descriptionHelp: string;
  descriptionPtBr: string;
  descriptionsHeading: string;
  descriptionsProductLinesCaption: string;
  expiry: string;
  expiryClear: string;
  expiryHelp: string;
  financialLockDescription: string;
  financialLockTitle: string;
  kindFixedAmount: string;
  kindProductLines: string;
  lineRemove: string;
  lineTotal: string;
  lines: string;
  linkType: string;
  pairsUnavailable: string;
  pairsUnavailableCta: string;
  pairsUnavailableDescription: string;
  previewComposition: string;
  previewCurrency: string;
  previewEmpty: string;
  previewExpiry: string;
  previewLines: string;
  previewNoExpiry: string;
  previewTitle: string;
  previewTotal: string;
  previewType: string;
  productsUnavailable: string;
  productsUnavailableCta: string;
  productsUnavailableDescription: string;
  quantity: string;
  quantityDecrease: string;
  quantityIncrease: string;
  reusable: string;
  runningTotal: string;
  searchLabel: string;
  searchPlaceholder: string;
  singleUse: string;
  structuralLockNote: string;
  submit: string;
  typeReusableCaption: string;
  typeSingleUseCaption: string;
  unavailable: string;
  unitPrice: string;
  validationBody: string;
  validationHeading: string;
}>;

type CompositionKind = "PRODUCT_LINES" | "FIXED_AMOUNT";
type LinkType = "SINGLE_USE" | "REUSABLE";

function RadioCard({
  caption,
  checked,
  disabled = false,
  id,
  name,
  onChange,
  title,
  value,
}: Readonly<{
  caption: string;
  checked: boolean;
  disabled?: boolean;
  id: string;
  name: string;
  onChange: () => void;
  title: string;
  value: string;
}>) {
  return (
    <label
      className="flex-1 cursor-pointer rounded-lg border p-4 transition-colors has-[:checked]:border-primary has-[:checked]:bg-accent-soft has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
      htmlFor={id}
    >
      <input checked={checked} className="sr-only" disabled={disabled} id={id} name={name} onChange={onChange} type="radio" value={value} />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
    </label>
  );
}

function LockNote({ label }: Readonly<{ label: string }>) {
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      <LockIcon aria-hidden className="size-3" /> {label}
    </p>
  );
}

function StructuralFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function DescriptionFields({
  copy,
  descriptionEn,
  descriptionPtBr,
  disabled,
  formId,
  omitUntilDirty,
  onChange,
  readOnly,
}: Readonly<{
  copy: LinkV2FormCopy;
  descriptionEn: string;
  descriptionPtBr: string;
  disabled: boolean;
  formId: string;
  omitUntilDirty: boolean;
  onChange: (field: "descriptionPtBr" | "descriptionEn", value: string) => void;
  readOnly: boolean;
}>) {
  const [dirty, setDirty] = useState(false);
  const fieldName = (name: string) => (readOnly || (omitUntilDirty && !dirty) ? undefined : name);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.descriptionsHeading}</CardTitle>
        {readOnly ? <CardDescription>{copy.descriptionsProductLinesCaption}</CardDescription> : <CardDescription>{copy.descriptionHelp}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <Field>
          <FieldLabel htmlFor={`${formId}-description-pt-br`}>{copy.descriptionPtBr}</FieldLabel>
          <Input
            disabled={disabled || readOnly}
            id={`${formId}-description-pt-br`}
            maxLength={160}
            name={fieldName("descriptionPtBr")}
            onChange={(event) => {
              setDirty(true);
              onChange("descriptionPtBr", event.target.value);
            }}
            required={!readOnly}
            value={readOnly ? "" : descriptionPtBr}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-description-en`}>{copy.descriptionEn}</FieldLabel>
          <Input
            aria-describedby={`${formId}-description-help`}
            disabled={disabled || readOnly}
            id={`${formId}-description-en`}
            maxLength={160}
            name={fieldName("descriptionEn")}
            onChange={(event) => {
              setDirty(true);
              onChange("descriptionEn", event.target.value);
            }}
            required={!readOnly}
            value={readOnly ? "" : descriptionEn}
          />
          <FieldDescription id={`${formId}-description-help`}>{copy.descriptionHelp}</FieldDescription>
        </Field>
        {disabled ? <LockNote label={copy.financialLockTitle} /> : null}
      </CardContent>
    </Card>
  );
}

function AmountField({
  amount,
  copy,
  disabled,
  formId,
  invalid,
  omitUntilDirty,
  onChange,
}: Readonly<{
  amount: string;
  copy: LinkV2FormCopy;
  disabled: boolean;
  formId: string;
  invalid: boolean;
  omitUntilDirty: boolean;
  onChange: (value: string) => void;
}>) {
  const [dirty, setDirty] = useState(false);
  const fieldName = omitUntilDirty && !dirty ? undefined : "amount";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{copy.amount}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field data-invalid={invalid}>
          <FieldLabel htmlFor={`${formId}-amount`}>{copy.amount}</FieldLabel>
          <Input
            aria-describedby={`${formId}-amount-help`}
            aria-invalid={invalid}
            data-invalid={invalid}
            disabled={disabled}
            id={`${formId}-amount`}
            inputMode="decimal"
            name={fieldName}
            onChange={(event) => {
              setDirty(true);
              onChange(event.target.value);
            }}
            required
            value={amount}
          />
          <FieldDescription id={`${formId}-amount-help`}>{copy.amountHelp}</FieldDescription>
          {invalid ? <p className="text-xs text-destructive">{copy.amountInvalid}</p> : null}
        </Field>
        {disabled ? <LockNote label={copy.financialLockTitle} /> : null}
      </CardContent>
    </Card>
  );
}

export function LinkV2Form({
  action,
  copy,
  currencyPairLabel,
  editReloadHref,
  financiallyLocked = false,
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
  currencyPairLabel?: string;
  editReloadHref?: string;
  financiallyLocked?: boolean;
  formId: string;
  from?: string;
  initialAmount?: string;
  initialDescriptionEn?: string;
  initialDescriptionPtBr?: string;
  initialExpiresAt?: string;
  initialKind?: CompositionKind;
  initialLines?: readonly LinkLineValue[];
  initialLinkType?: LinkType;
  locale: SupportedLocale;
  mode: "create" | "edit";
  pairs: readonly LinkV2FormPair[];
  products: readonly LinkLineProduct[];
  version?: number;
}>) {
  const editing = mode === "edit";
  const [kind, setKind] = useState<CompositionKind>(initialKind ?? "PRODUCT_LINES");
  const [linkType, setLinkType] = useState<LinkType>(initialLinkType ?? "REUSABLE");
  const [currencyPairId, setCurrencyPairId] = useState("");
  const [fixedDescriptionPtBr, setFixedDescriptionPtBr] = useState(initialDescriptionPtBr ?? "");
  const [fixedDescriptionEn, setFixedDescriptionEn] = useState(initialDescriptionEn ?? "");
  const [fixedAmount, setFixedAmount] = useState(initialAmount ?? "");
  const [lines, setLines] = useState<LinkLinesEditorLine[]>(() => initialEditorLines(initialLines));
  const [expiresAtValue, setExpiresAtValue] = useState(initialExpiresAt ?? "");
  const [expiresAtDirty, setExpiresAtDirty] = useState(false);
  const [showConflict, setShowConflict] = useState(false);
  const noPairs = pairs.length === 0;
  const noProducts = products.length === 0;
  const submitDisabled = !editing && (noPairs || (kind === "PRODUCT_LINES" && noProducts));
  const amountInvalid = kind === "FIXED_AMOUNT" && fixedAmount !== "" && !isLinkMoneyAmount(fixedAmount);
  const compositionLocked = financiallyLocked;
  const runningTotal = linkLinesTotal(lines, products);

  // Edit posts `/payment-links-v2/<id>`, so the trailing segment scopes the
  // draft per link the same way the order comment/outcome drafts scope by
  // order id; create has a single fixed key.
  const draftKey = editing ? `payment-link-v2-edit:${action.slice(action.lastIndexOf("/") + 1)}` : "payment-link-v2-create";

  useEffect(() => {
    if (!hasFailureNotice(LINKS_NOTICE_KEY, LINK_DRAFT_FAILURE_NOTICES)) {
      clearFormDraft(draftKey);
      return;
    }
    // sessionStorage is a client-only external system unavailable during the
    // server render, so seeding these fields cannot happen before mount.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (editing) setShowConflict(true);
    const draft = readFormDraft(draftKey);
    if (!draft) return;
    if (!editing && (draft.compositionKind === "PRODUCT_LINES" || draft.compositionKind === "FIXED_AMOUNT")) {
      setKind(draft.compositionKind);
    }
    if (!editing && (draft.linkType === "SINGLE_USE" || draft.linkType === "REUSABLE")) {
      setLinkType(draft.linkType);
    }
    if (!editing && typeof draft.currencyPairId === "string") setCurrencyPairId(draft.currencyPairId);
    if (typeof draft.descriptionPtBr === "string") setFixedDescriptionPtBr(draft.descriptionPtBr);
    if (typeof draft.descriptionEn === "string") setFixedDescriptionEn(draft.descriptionEn);
    if (typeof draft.amount === "string") setFixedAmount(draft.amount);
    if (typeof draft.expiresAt === "string") setExpiresAtValue(draft.expiresAt);
    if (draft.expiresAtDirty === "true") setExpiresAtDirty(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    clearFormDraft(draftKey);
  }, [draftKey, editing]);

  const handleSubmit = () => {
    const draft: Record<string, string> = {};
    if (!editing) {
      draft.compositionKind = kind;
      draft.linkType = linkType;
      draft.currencyPairId = currencyPairId;
    }
    draft.amount = fixedAmount;
    draft.descriptionEn = fixedDescriptionEn;
    draft.descriptionPtBr = fixedDescriptionPtBr;
    if (expiresAtDirty) draft.expiresAt = expiresAtValue;
    saveFormDraft(draftKey, draft);
  };


  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <form action={action} className="space-y-4 lg:col-span-8" id={formId} method="post" onSubmit={handleSubmit}>
        {editing ? (
          <>
            <Input name="action" type="hidden" value="edit" />
            <Input name="version" type="hidden" value={version ?? 0} />
          </>
        ) : null}
        {!editing && from !== undefined ? <Input name="from" type="hidden" value={from} /> : null}

        {editing && compositionLocked ? (
          <Alert variant="warning">
            <LockIcon aria-hidden className="size-4" />
            <AlertTitle>{copy.financialLockTitle}</AlertTitle>
            <AlertDescription>{copy.financialLockDescription}</AlertDescription>
          </Alert>
        ) : null}

        {amountInvalid ? (
          <Alert variant="destructive">
            <AlertTitle>{copy.validationHeading}</AlertTitle>
            <AlertDescription>{copy.validationBody}</AlertDescription>
          </Alert>
        ) : null}

        {editing && showConflict ? (
          <Alert variant="destructive">
            <AlertTitle>{copy.conflictTitle}</AlertTitle>
            <AlertDescription>{copy.conflictBody}</AlertDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              {editReloadHref ? (
                <Button asChild data-ds-hit-target size="sm" variant="outline">
                  <a href={editReloadHref}>{copy.conflictReload}</a>
                </Button>
              ) : null}
              <Button data-ds-hit-target onClick={() => setShowConflict(false)} size="sm" type="button" variant="secondary">
                {copy.conflictRetry}
              </Button>
            </div>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{copy.composition}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <StructuralFact label={copy.composition} value={initialKind === "FIXED_AMOUNT" ? copy.kindFixedAmount : copy.kindProductLines} />
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row" role="radiogroup" aria-label={copy.composition}>
                <RadioCard
                  caption={copy.compositionProductLinesCaption}
                  checked={kind === "PRODUCT_LINES"}
                  id={`${formId}-kind-lines`}
                  name="compositionKind"
                  onChange={() => setKind("PRODUCT_LINES")}
                  title={copy.kindProductLines}
                  value="PRODUCT_LINES"
                />
                <RadioCard
                  caption={copy.compositionFixedAmountCaption}
                  checked={kind === "FIXED_AMOUNT"}
                  id={`${formId}-kind-fixed`}
                  name="compositionKind"
                  onChange={() => setKind("FIXED_AMOUNT")}
                  title={copy.kindFixedAmount}
                  value="FIXED_AMOUNT"
                />
              </div>
            )}
            {editing ? <LockNote label={copy.structuralLockNote} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.currencyPair}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <StructuralFact label={copy.currencyPair} value={currencyPairLabel ?? "—"} />
            ) : noPairs ? (
              <Alert variant="warning">
                <AlertTitle>{copy.pairsUnavailable}</AlertTitle>
                <AlertDescription>{copy.pairsUnavailableDescription}</AlertDescription>
                <div className="mt-3">
                  <Button asChild data-ds-hit-target size="sm" variant="outline">
                    <a href="/settings">{copy.pairsUnavailableCta}</a>
                  </Button>
                </div>
              </Alert>
            ) : (
              <Field>
                <FieldLabel htmlFor={`${formId}-pair`}>{copy.currencyPair}</FieldLabel>
                <NativeSelect
                  id={`${formId}-pair`}
                  name="currencyPairId"
                  onChange={(event) => setCurrencyPairId(event.target.value)}
                  required
                  value={currencyPairId}
                >
                  <NativeSelectOption disabled value="">{copy.chooseCurrencyPair}</NativeSelectOption>
                  {pairs.map((pair) => (
                    <NativeSelectOption key={pair.id} value={pair.id}>{pair.label}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {editing ? <LockNote label={copy.structuralLockNote} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.linkType}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing ? (
              <StructuralFact label={copy.linkType} value={initialLinkType === "SINGLE_USE" ? copy.singleUse : copy.reusable} />
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row" role="radiogroup" aria-label={copy.linkType}>
                <RadioCard
                  caption={copy.typeReusableCaption}
                  checked={linkType === "REUSABLE"}
                  id={`${formId}-type-reusable`}
                  name="linkType"
                  onChange={() => setLinkType("REUSABLE")}
                  title={copy.reusable}
                  value="REUSABLE"
                />
                <RadioCard
                  caption={copy.typeSingleUseCaption}
                  checked={linkType === "SINGLE_USE"}
                  id={`${formId}-type-single`}
                  name="linkType"
                  onChange={() => setLinkType("SINGLE_USE")}
                  title={copy.singleUse}
                  value="SINGLE_USE"
                />
              </div>
            )}
            {editing ? <LockNote label={copy.structuralLockNote} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{copy.expiry}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel htmlFor={`${formId}-expiry`}>{copy.expiry}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  aria-describedby={`${formId}-expiry-help`}
                  className="w-auto"
                  id={`${formId}-expiry`}
                  name={editing && !expiresAtDirty ? undefined : "expiresAt"}
                  onChange={(event) => {
                    setExpiresAtDirty(true);
                    setExpiresAtValue(event.target.value);
                  }}
                  type="datetime-local"
                  value={expiresAtValue}
                />
                {expiresAtValue !== "" ? (
                  <Button
                    data-ds-hit-target
                    onClick={() => {
                      setExpiresAtDirty(true);
                      setExpiresAtValue("");
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <XIcon aria-hidden className="size-4" /> {copy.expiryClear}
                  </Button>
                ) : null}
              </div>
              <FieldDescription id={`${formId}-expiry-help`}>{copy.expiryHelp}</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        <DescriptionFields
          copy={copy}
          descriptionEn={fixedDescriptionEn}
          descriptionPtBr={fixedDescriptionPtBr}
          disabled={compositionLocked}
          formId={formId}
          omitUntilDirty={editing}
          onChange={(field, value) => {
            if (field === "descriptionPtBr") setFixedDescriptionPtBr(value);
            else setFixedDescriptionEn(value);
          }}
          readOnly={kind === "PRODUCT_LINES"}
        />

        {kind === "PRODUCT_LINES" ? (
          <Card>
            <CardHeader>
              <CardTitle>{copy.lines}</CardTitle>
            </CardHeader>
            <CardContent>
              {noProducts && !editing ? (
                <Alert variant="warning">
                  <AlertTitle>{copy.productsUnavailable}</AlertTitle>
                  <AlertDescription>{copy.productsUnavailableDescription}</AlertDescription>
                  <div className="mt-3">
                    <Button asChild data-ds-hit-target size="sm" variant="outline">
                      <a href="/catalog">{copy.productsUnavailableCta}</a>
                    </Button>
                  </div>
                </Alert>
              ) : (
                <>
                  <LinkLinesEditor
                    copy={{
                      add: copy.add,
                      alreadyAdded: copy.alreadyAdded,
                      chooseProduct: copy.chooseProduct,
                      lineTotal: copy.lineTotal,
                      quantity: copy.quantity,
                      quantityDecrease: copy.quantityDecrease,
                      quantityIncrease: copy.quantityIncrease,
                      remove: copy.lineRemove,
                      runningTotal: copy.runningTotal,
                      searchLabel: copy.searchLabel,
                      searchPlaceholder: copy.searchPlaceholder,
                      unavailable: copy.unavailable,
                      unitPrice: copy.unitPrice,
                    }}
                    disabled={compositionLocked}
                    fieldName="lines"
                    formId={formId}
                    locale={locale}
                    omitUntilDirty={editing}
                    onChange={setLines}
                    products={products}
                    value={lines}
                  />
                  {compositionLocked ? <LockNote label={copy.financialLockTitle} /> : null}
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <AmountField
            amount={fixedAmount}
            copy={copy}
            disabled={compositionLocked}
            formId={formId}
            invalid={amountInvalid}
            omitUntilDirty={editing}
            onChange={setFixedAmount}
          />
        )}

        <CatalogSubmit disabled={submitDisabled} form={formId} label={copy.submit} />
      </form>

      <div className="lg:col-span-4">
        <div className="lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle>{copy.previewTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{copy.previewType}</dt>
                  <dd className="text-foreground">{linkType === "REUSABLE" ? copy.reusable : copy.singleUse}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{copy.previewComposition}</dt>
                  <dd className="text-foreground">{kind === "PRODUCT_LINES" ? copy.kindProductLines : copy.kindFixedAmount}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{copy.previewCurrency}</dt>
                  <dd className="text-foreground">{editing ? currencyPairLabel ?? "—" : pairs.find((pair) => pair.id === currencyPairId)?.label ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">{copy.previewExpiry}</dt>
                  <dd className="text-foreground">{expiresAtValue !== "" ? new Date(expiresAtValue).toLocaleString(locale) : copy.previewNoExpiry}</dd>
                </div>
                {kind === "PRODUCT_LINES" ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{copy.previewLines}</dt>
                    <dd className="font-mono text-foreground">{lines.length}</dd>
                  </div>
                ) : null}
                {(kind === "PRODUCT_LINES" && lines.length === 0)
                || (kind === "FIXED_AMOUNT" && fixedAmount === "" && fixedDescriptionPtBr === "" && fixedDescriptionEn === "") ? (
                  <p className="border-t pt-3 text-muted-foreground">{copy.previewEmpty}</p>
                ) : (
                  <div className="border-t pt-3">
                    <dt className="text-muted-foreground">{copy.previewTotal}</dt>
                    <dd className="mt-1">
                      <span className="font-mono text-lg font-semibold text-foreground">
                        {kind === "FIXED_AMOUNT"
                          ? (isLinkMoneyAmount(fixedAmount) ? formatCatalogPrice(fixedAmount, null, locale) : (fixedAmount || "—"))
                          : formatCatalogPrice(runningTotal, null, locale)}
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

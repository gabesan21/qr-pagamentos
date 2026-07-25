"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { SupportedLocale } from "@/i18n/locales";

// Ordered product-lines editor for the Commerce V2 link forms: 1-20 lines,
// quantity 1-9,999, per-link product uniqueness hinted by disabling already
// chosen products (the service remains the enforcer). The hidden `lines` JSON
// the route parses is serialized from local state; under `omitUntilDirty` the
// field stays unnamed until the first change so an untouched composition posts
// nothing and never trips the checkout-attempt gate (absent = unchanged).

export type LinkLineProduct = Readonly<{
  id: string;
  titlePtBr: string;
  titleEn: string;
}>;

export type LinkLineValue = Readonly<{
  productId: string;
  quantity: number;
}>;

export type LinkLinesEditorCopy = Readonly<{
  product: string;
  chooseProduct: string;
  quantity: string;
  add: string;
  remove: string;
}>;

type EditorLine = Readonly<{
  key: number;
  productId: string;
  quantity: string;
}>;

const MAX_LINES = 20;

function initialEditorLines(initialLines: readonly LinkLineValue[] | undefined): EditorLine[] {
  if (initialLines && initialLines.length > 0) {
    return initialLines.map((line, index) => ({ key: index, productId: line.productId, quantity: String(line.quantity) }));
  }
  return [{ key: 0, productId: "", quantity: "1" }];
}

export function LinkLinesEditor({
  copy,
  disabled = false,
  fieldName,
  formId,
  initialLines,
  locale,
  omitUntilDirty = false,
  products,
}: Readonly<{
  copy: LinkLinesEditorCopy;
  disabled?: boolean;
  fieldName: string;
  formId: string;
  initialLines?: readonly LinkLineValue[];
  locale: SupportedLocale;
  omitUntilDirty?: boolean;
  products: readonly LinkLineProduct[];
}>) {
  const [lines, setLines] = useState<EditorLine[]>(() => initialEditorLines(initialLines));
  const [dirty, setDirty] = useState(false);
  const nextKey = useRef(lines.length);

  const chosen = new Set(lines.map((line) => line.productId).filter((id) => id !== ""));
  const unused = products.filter((product) => !chosen.has(product.id));
  const change = (update: (current: EditorLine[]) => EditorLine[]) => {
    setDirty(true);
    setLines(update);
  };

  const serialized = JSON.stringify(lines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })));

  return (
    <div className="flex flex-col gap-4">
      <input name={omitUntilDirty && !dirty ? undefined : fieldName} type="hidden" value={serialized} />
      {lines.map((line, index) => (
        <div className="flex flex-wrap items-end gap-3" key={line.key}>
          <Field className="min-w-56 flex-1">
            <FieldLabel htmlFor={`${formId}-line-${line.key}-product`}>{copy.product}</FieldLabel>
            <NativeSelect
              disabled={disabled}
              id={`${formId}-line-${line.key}-product`}
              onChange={(event) => change((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, productId: event.target.value } : entry))}
              required
              value={line.productId}
            >
              <NativeSelectOption disabled value="">{copy.chooseProduct}</NativeSelectOption>
              {products.map((product) => (
                <NativeSelectOption disabled={chosen.has(product.id) && product.id !== line.productId} key={product.id} value={product.id}>
                  {locale === "pt-BR" ? product.titlePtBr : product.titleEn}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field className="w-28">
            <FieldLabel htmlFor={`${formId}-line-${line.key}-quantity`}>{copy.quantity}</FieldLabel>
            <Input
              disabled={disabled}
              id={`${formId}-line-${line.key}-quantity`}
              inputMode="numeric"
              max={9999}
              min={1}
              onChange={(event) => change((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, quantity: event.target.value } : entry))}
              required
              step={1}
              type="number"
              value={line.quantity}
            />
          </Field>
          <Button
            data-ds-hit-target
            disabled={disabled || lines.length <= 1}
            onClick={() => change((current) => current.filter((_, entryIndex) => entryIndex !== index))}
            type="button"
            variant="outline"
          >
            {copy.remove}
          </Button>
        </div>
      ))}
      <div>
        <Button
          data-ds-hit-target
          disabled={disabled || lines.length >= MAX_LINES || unused.length === 0}
          onClick={() => {
            const key = nextKey.current;
            nextKey.current += 1;
            change((current) => [...current, { key, productId: "", quantity: "1" }]);
          }}
          type="button"
          variant="outline"
        >
          {copy.add}
        </Button>
      </div>
    </div>
  );
}

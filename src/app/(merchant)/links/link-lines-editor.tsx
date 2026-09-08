"use client";

import { useId, useRef, useState } from "react";
import { MinusIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { showToast } from "@/components/ui/toast";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import type { SupportedLocale } from "@/i18n/locales";

import { formatCatalogPrice } from "../catalog/price-format";
import { linkMoneyMultiply, linkMoneySum } from "./link-money";

// Ordered product-lines editor for the Commerce V2 link forms: a searchable
// picker over the already server-rendered active products (client-side
// filtering only, never a new read), −/+ steppers bound to 1–9,999, unit
// price and exact line total per line (`link-money.ts`, never `Number()` on
// an amount), an exact running total, and a 1–20 line bound with per-link
// product uniqueness enforced by disabling already-chosen results. The
// hidden `lines` JSON the route parses is serialized from local state; under
// `omitUntilDirty` the field stays unnamed until the first change so an
// untouched composition posts nothing and never trips the checkout-attempt
// gate (absent = unchanged). A line whose product fell out of the active
// list (edit only) keeps its server-known title/price and renders locked
// with an unavailable caption instead of an empty picker result.

export type LinkLineProduct = Readonly<{
  id: string;
  titlePtBr: string;
  titleEn: string;
  price: string;
}>;

export type LinkLineValue = Readonly<{
  productId: string;
  quantity: number;
  // Server-known snapshot for a line the current active-product list may no
  // longer contain (deactivated since); absent for a fresh in-session line,
  // whose title/price always come live from `products`.
  titlePtBr?: string;
  titleEn?: string;
  unitPrice?: string;
  available?: boolean;
}>;

export type LinkLinesEditorCopy = Readonly<{
  add: string;
  alreadyAdded: string;
  chooseProduct: string;
  lineTotal: string;
  quantity: string;
  quantityDecrease: string;
  quantityIncrease: string;
  remove: string;
  runningTotal: string;
  searchLabel: string;
  searchPlaceholder: string;
  unavailable: string;
  unitPrice: string;
}>;

export type LinkLinesEditorLine = Readonly<{
  key: number;
  productId: string;
  quantity: number;
  titlePtBr?: string;
  titleEn?: string;
  unitPrice?: string;
  available: boolean;
}>;

const MAX_LINES = 20;
const MIN_QUANTITY = 1;
const MAX_QUANTITY = 9_999;

export function initialEditorLines(initialLines: readonly LinkLineValue[] | undefined): LinkLinesEditorLine[] {
  if (initialLines && initialLines.length > 0) {
    return initialLines.map((line, index) => ({
      key: index,
      productId: line.productId,
      quantity: line.quantity,
      available: line.available ?? true,
      ...(line.titlePtBr !== undefined ? { titlePtBr: line.titlePtBr } : {}),
      ...(line.titleEn !== undefined ? { titleEn: line.titleEn } : {}),
      ...(line.unitPrice !== undefined ? { unitPrice: line.unitPrice } : {}),
    }));
  }
  return [];
}

function lineTitle(line: LinkLinesEditorLine, products: readonly LinkLineProduct[], locale: SupportedLocale) {
  const product = products.find((entry) => entry.id === line.productId);
  if (product) return locale === "pt-BR" ? product.titlePtBr : product.titleEn;
  return (locale === "pt-BR" ? line.titlePtBr : line.titleEn) ?? line.productId;
}

function lineUnitPrice(line: LinkLinesEditorLine, products: readonly LinkLineProduct[]) {
  const product = products.find((entry) => entry.id === line.productId);
  return product?.price ?? line.unitPrice ?? "0";
}

// Exact running total in canonical decimal, exposed so the form's sticky
// preview can mirror the same number without re-deriving it (BigInt
// micro-units via `link-money.ts`, never `Number()`).
export function linkLinesTotal(lines: readonly LinkLinesEditorLine[], products: readonly LinkLineProduct[]) {
  return linkMoneySum(lines.map((line) => linkMoneyMultiply(lineUnitPrice(line, products), line.quantity)));
}

export function LinkLinesEditor({
  copy,
  disabled = false,
  fieldName,
  formId,
  locale,
  omitUntilDirty = false,
  onChange,
  products,
  value,
}: Readonly<{
  copy: LinkLinesEditorCopy;
  disabled?: boolean;
  fieldName: string;
  formId: string;
  locale: SupportedLocale;
  omitUntilDirty?: boolean;
  onChange: (lines: LinkLinesEditorLine[]) => void;
  products: readonly LinkLineProduct[];
  value: readonly LinkLinesEditorLine[];
}>) {
  const reactId = useId();
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");
  const nextKey = useRef(value.length);

  const lines = value;
  const chosen = new Set(lines.map((line) => line.productId));
  const change = (update: (current: LinkLinesEditorLine[]) => LinkLinesEditorLine[]) => {
    setDirty(true);
    onChange(update([...lines]));
  };

  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery === "" ? [] : products.filter((product) => (
    !chosen.has(product.id)
    && (product.titlePtBr.toLowerCase().includes(normalizedQuery) || product.titleEn.toLowerCase().includes(normalizedQuery))
  )).slice(0, 6);

  const addProduct = (product: LinkLineProduct) => {
    if (chosen.has(product.id)) {
      showToast({ kind: "info", message: copy.alreadyAdded });
      return;
    }
    const key = nextKey.current;
    nextKey.current += 1;
    change((current) => [...current, { available: true, key, productId: product.id, quantity: MIN_QUANTITY }]);
  };

  const adjustQuantity = (key: number, delta: number) => {
    change((current) => current.map((entry) => (
      entry.key === key
        ? { ...entry, quantity: Math.min(MAX_QUANTITY, Math.max(MIN_QUANTITY, entry.quantity + delta)) }
        : entry
    )));
  };

  const removeLine = (key: number) => {
    change((current) => current.filter((entry) => entry.key !== key));
  };

  const runningTotal = linkMoneySum(lines.map((line) => linkMoneyMultiply(lineUnitPrice(line, products), line.quantity)));
  const atMaxLines = lines.length >= MAX_LINES;

  return (
    <div className="flex flex-col gap-4">
      <input
        name={omitUntilDirty && !dirty ? undefined : fieldName}
        type="hidden"
        value={JSON.stringify(lines.map((line) => ({ productId: line.productId, quantity: line.quantity })))}
      />

      {lines.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {lines.map((line) => (
            <li
              className="flex flex-wrap items-center gap-3 rounded-md border p-3 data-[unavailable=true]:border-destructive/40 data-[unavailable=true]:bg-destructive/5"
              data-unavailable={!line.available}
              key={line.key}
            >
              <div className="min-w-40 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{lineTitle(line, products, locale)}</p>
                {!line.available ? <p className="text-xs text-destructive">{copy.unavailable}</p> : null}
              </div>
              <div className="flex items-center gap-1" role="group" aria-label={copy.quantity}>
                <button
                  aria-label={copy.quantityDecrease}
                  className="flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  disabled={disabled || !line.available || line.quantity <= MIN_QUANTITY}
                  onClick={() => adjustQuantity(line.key, -1)}
                  type="button"
                >
                  <MinusIcon aria-hidden className="size-3.5" />
                </button>
                <span className="w-10 text-center font-mono text-sm tabular-nums text-foreground">{line.quantity}</span>
                <button
                  aria-label={copy.quantityIncrease}
                  className="flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                  disabled={disabled || !line.available || line.quantity >= MAX_QUANTITY}
                  onClick={() => adjustQuantity(line.key, 1)}
                  type="button"
                >
                  <PlusIcon aria-hidden className="size-3.5" />
                </button>
              </div>
              <div className="w-24 text-right">
                <p className="text-xs text-muted-foreground">{copy.unitPrice}</p>
                <MoneyText value={formatCatalogPrice(lineUnitPrice(line, products), null, locale)} />
              </div>
              <div className="w-24 text-right">
                <p className="text-xs text-muted-foreground">{copy.lineTotal}</p>
                <MoneyText value={formatCatalogPrice(linkMoneyMultiply(lineUnitPrice(line, products), line.quantity), null, locale)} />
              </div>
              <button
                aria-label={copy.remove}
                className="rounded-md p-1.5 text-muted-foreground hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                disabled={disabled}
                onClick={() => removeLine(line.key)}
                type="button"
              >
                <XIcon aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {!disabled && !atMaxLines ? (
        <div className="rounded-md border border-dashed p-3">
          <Field>
            <FieldLabel htmlFor={`${formId}-${reactId}-search`}>{copy.searchLabel}</FieldLabel>
            <div className="relative">
              <SearchIcon aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                id={`${formId}-${reactId}-search`}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                type="search"
                value={query}
              />
            </div>
          </Field>
          {searchResults.length > 0 ? (
            <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {searchResults.map((product) => (
                <li key={product.id}>
                  <button
                    className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-muted"
                    onClick={() => addProduct(product)}
                    type="button"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{locale === "pt-BR" ? product.titlePtBr : product.titleEn}</span>
                    <MoneyText value={formatCatalogPrice(product.price, null, locale)} />
                    <PlusIcon aria-hidden className="size-4 text-primary" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm font-medium text-muted-foreground">{copy.runningTotal}</span>
        <MoneyText size="large" value={formatCatalogPrice(runningTotal, null, locale)} />
      </div>
    </div>
  );
}

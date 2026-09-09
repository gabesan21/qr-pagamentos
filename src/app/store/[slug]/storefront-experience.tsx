"use client";

import { MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  STOREFRONT_CART_QUANTITY_MAXIMUM,
  hydrateStorefrontCart,
  isStorefrontCartAmount,
  serializeStorefrontCart,
  setStorefrontCartCustomAmount,
  setStorefrontCartProductQuantity,
  storefrontCartStorageKey,
  storefrontCartTotals,
  type StorefrontCartItem,
  type StorefrontCartProductItem,
} from "@/storefront/cart";
import type { PublicStorefrontCatalogGroup } from "@/storefront/public-storefront";

export type StorefrontExperienceCopy = Readonly<{
  cartCheckout: string;
  cartCheckoutFailed: string;
  cartEmpty: string;
  cartHeading: string;
  cartRemove: string;
  cartTotalLabel: string;
  cartUpdated: string;
  customAmountAdd: string;
  customAmountDescription: string;
  customAmountInvalid: string;
  customAmountLabel: string;
  customAmountPay: string;
  customAmountTitle: string;
  customAmountUpdate: string;
  decreaseQuantity: string;
  groupUncategorized: string;
  increaseQuantity: string;
  priceLabel: string;
  productsHeading: string;
  quantityLabel: string;
}>;

type QuantityCommit = (reference: string, quantity: number) => void;

// Browser-local storage is a best-effort cache: private modes may deny it and
// the cart simply becomes session-memory, never a render failure.
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // See readStorage: storage denial degrades to session-memory.
  }
}

function formatAmount(amount: string, currencyCode: string | null): string {
  return currencyCode ? `${amount} ${currencyCode}` : amount;
}

// Cart checkout submission (9.1.3): the browser sends only product identity
// and quantity to the sessionless command; success is exactly a 24-character
// one-time link identifier, and every other outcome is the one opaque failure.
const PAYMENT_LINK_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export type StorefrontCartCheckoutOutcome =
  | Readonly<{ kind: "issued"; paymentLinkIdentifier: string }>
  | Readonly<{ kind: "failed" }>;

export async function submitStorefrontCartCheckout(
  slug: string,
  items: readonly StorefrontCartItem[],
  fetchImplementation: typeof fetch = fetch,
): Promise<StorefrontCartCheckoutOutcome> {
  const productItems = items.filter((item): item is StorefrontCartProductItem => item.kind === "product");
  if (productItems.length === 0 || productItems.length !== items.length) return { kind: "failed" };
  let response: Response;
  try {
    response = await fetchImplementation(`/api/store/${slug}/cart/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: productItems.map((item) => ({ reference: item.reference, quantity: item.quantity })) }),
    });
  } catch {
    return { kind: "failed" };
  }
  if (response.status !== 201) return { kind: "failed" };
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "failed" };
  }
  const identifier = (payload as { paymentLinkIdentifier?: unknown })?.paymentLinkIdentifier;
  if (typeof identifier !== "string" || !PAYMENT_LINK_IDENTIFIER_PATTERN.test(identifier)) return { kind: "failed" };
  return { kind: "issued", paymentLinkIdentifier: identifier };
}

function QuantityStepper({ copy, onCommit, quantity }: Readonly<{
  copy: StorefrontExperienceCopy;
  onCommit: (quantity: number) => void;
  quantity: number;
}>) {
  const [draft, setDraft] = useState<string | null>(null);
  const commitDraft = (text: string) => {
    setDraft(null);
    if (/^[0-9]{1,4}$/.test(text)) onCommit(Number.parseInt(text, 10));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        aria-label={copy.decreaseQuantity}
        disabled={quantity === 0}
        onClick={() => onCommit(quantity - 1)}
        size="icon"
        type="button"
        variant="outline"
      >
        <MinusIcon aria-hidden="true" data-icon="inline-start" />
      </Button>
      <Input
        aria-label={copy.quantityLabel}
        autoComplete="off"
        className="w-12 text-center tabular-nums"
        inputMode="numeric"
        onBlur={() => {
          if (draft !== null) commitDraft(draft);
        }}
        onChange={(event) => {
          if (/^[0-9]{0,4}$/.test(event.target.value)) setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitDraft(event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
        value={draft ?? String(quantity)}
      />
      <Button
        aria-label={copy.increaseQuantity}
        disabled={quantity >= STOREFRONT_CART_QUANTITY_MAXIMUM}
        onClick={() => onCommit(quantity + 1)}
        size="icon"
        type="button"
        variant="outline"
      >
        <PlusIcon aria-hidden="true" data-icon="inline-start" />
      </Button>
    </div>
  );
}

function CustomAmountField({
  amountDraft,
  amountInvalid,
  copy,
  currencyCode,
  layout,
  onChange,
}: Readonly<{
  amountDraft: string;
  amountInvalid: boolean;
  copy: StorefrontExperienceCopy;
  currencyCode: string | null;
  layout: string;
  onChange: (value: string) => void;
}>) {
  return (
    <Field className="grid max-w-[var(--layout-max)] gap-2" data-invalid={amountInvalid || undefined}>
      <FieldLabel className={layout === "table" ? "sr-only" : undefined} htmlFor="storefront-custom-amount">
        {copy.customAmountLabel}
        {currencyCode ? ` (${currencyCode})` : ""}
      </FieldLabel>
      {layout !== "table" ? <FieldDescription>{copy.customAmountDescription}</FieldDescription> : null}
      <Input
        aria-describedby={amountInvalid ? "storefront-custom-amount-error" : undefined}
        aria-invalid={amountInvalid || undefined}
        autoComplete="off"
        id="storefront-custom-amount"
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        value={amountDraft}
      />
      {amountInvalid ? (
        <FieldError id="storefront-custom-amount-error">{copy.customAmountInvalid}</FieldError>
      ) : null}
    </Field>
  );
}

// Pure presentational composition: the server render and the first client
// render agree on an empty cart, and the stateful wrapper hydrates the stored
// cart afterwards. Exported so tests can exercise populated states without a
// DOM storage shim.
export function StorefrontExperienceView({
  amountDraft,
  amountInvalid,
  catalog,
  checkoutFailed,
  checkoutPending,
  copy,
  items,
  layout,
  onAmountDraftChange,
  onAmountSubmit,
  onCheckout,
  onQuantityCommit,
  onRemove,
  payHref,
  recovered,
  standalonePaymentCurrencyCode,
  standalonePayments,
}: Readonly<{
  amountDraft: string;
  amountInvalid: boolean;
  catalog: readonly PublicStorefrontCatalogGroup[];
  checkoutFailed: boolean;
  checkoutPending: boolean;
  copy: StorefrontExperienceCopy;
  items: readonly StorefrontCartItem[];
  layout: string;
  onAmountDraftChange: (value: string) => void;
  onAmountSubmit: () => void;
  onCheckout: () => void;
  onQuantityCommit: QuantityCommit;
  onRemove: (item: StorefrontCartItem) => void;
  payHref: string;
  recovered: boolean;
  standalonePaymentCurrencyCode: string | null;
  standalonePayments: boolean;
}>) {
  const catalogProducts = catalog.flatMap((group) => group.products);
  const productByReference = new Map(catalogProducts.map((product) => [product.reference, product]));
  const quantityFor = (reference: string) => {
    const item = items.find((entry) => entry.kind === "product" && entry.reference === reference);
    return item?.kind === "product" ? item.quantity : 0;
  };
  const customAmountInCart = items.some((item) => item.kind === "custom-amount");
  const totals = storefrontCartTotals(items, catalogProducts, standalonePaymentCurrencyCode);

  const customAmountActions = (
    <div className="flex flex-wrap gap-3">
      <Button onClick={onAmountSubmit} type="button">
        {customAmountInCart ? copy.customAmountUpdate : copy.customAmountAdd}
      </Button>
      {/* 9.2.2: the standalone-payment entry point; the amount rides the query
          as prefill only and is revalidated by the pay page and by 9.2.1. */}
      <Button asChild variant="outline">
        <a href={payHref}>{copy.customAmountPay}</a>
      </Button>
    </div>
  );

  const customAmountField = (
    <CustomAmountField
      amountDraft={amountDraft}
      amountInvalid={amountInvalid}
      copy={copy}
      currencyCode={standalonePaymentCurrencyCode}
      layout={layout}
      onChange={onAmountDraftChange}
    />
  );

  return (
    <div className="grid gap-8">
      <section aria-label={copy.productsHeading} className="grid gap-5" data-layout={layout}>
        <h2 className="m-0 font-[family-name:var(--font-display)] text-lg font-semibold leading-7">{copy.productsHeading}</h2>
        {standalonePayments ? (
          layout === "table" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.customAmountTitle}</TableHead>
                  <TableHead>
                    {copy.customAmountLabel}
                    {standalonePaymentCurrencyCode ? ` (${standalonePaymentCurrencyCode})` : ""}
                  </TableHead>
                  <TableHead>
                    <span className="sr-only">{copy.customAmountAdd}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <p className="m-0 font-semibold break-words">{copy.customAmountTitle}</p>
                    <p className="m-0 max-w-[var(--layout-max)] whitespace-pre-wrap">{copy.customAmountDescription}</p>
                  </TableCell>
                  <TableCell>{customAmountField}</TableCell>
                  <TableCell>{customAmountActions}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <Card className="w-full">
              <CardHeader>
                <CardTitle>{copy.customAmountTitle}</CardTitle>
                <CardDescription className="max-w-[var(--layout-max)] whitespace-pre-wrap">{copy.customAmountDescription}</CardDescription>
              </CardHeader>
              <CardContent>{customAmountField}</CardContent>
              <CardFooter>{customAmountActions}</CardFooter>
            </Card>
          )
        ) : null}
        {catalog.map((group) => (
          <section className="grid gap-4" key={group.name ?? "uncategorized"}>
            <h3 className="m-0 break-words text-sm font-semibold">{group.name ?? copy.groupUncategorized}</h3>
            {layout === "table" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.productsHeading}</TableHead>
                    <TableHead>{copy.priceLabel}</TableHead>
                    <TableHead>{copy.quantityLabel}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.products.map((product) => (
                    <TableRow key={product.reference}>
                      <TableCell>
                        <p className="m-0 font-semibold break-words">{product.title}</p>
                        <p className="m-0 max-w-[var(--layout-max)] whitespace-pre-wrap">{product.description}</p>
                      </TableCell>
                      <TableCell>
                        <MoneyText
                          pairLabel={product.currencyCode ?? undefined}
                          value={product.price}
                        />
                      </TableCell>
                      <TableCell>
                        <QuantityStepper
                          copy={copy}
                          onCommit={(quantity) => onQuantityCommit(product.reference, quantity)}
                          quantity={quantityFor(product.reference)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="grid gap-5">
                {group.products.map((product) => (
                  <Card className="w-full" key={product.reference}>
                    {product.imageMediaIdentifier ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="aspect-[2/1] w-full rounded-md object-cover"
                        src={`/media/${product.imageMediaIdentifier}`}
                      />
                    ) : null}
                    <CardHeader>
                      <CardTitle>{product.title}</CardTitle>
                      <CardDescription className="max-w-[var(--layout-max)] whitespace-pre-wrap">{product.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="m-0 tabular-nums">
                        <span className="text-xs font-semibold text-muted-foreground">{copy.priceLabel}</span>{" "}
                        <MoneyText pairLabel={product.currencyCode ?? undefined} value={product.price} />
                      </p>
                    </CardContent>
                    <CardFooter>
                      <QuantityStepper
                        copy={copy}
                        onCommit={(quantity) => onQuantityCommit(product.reference, quantity)}
                        quantity={quantityFor(product.reference)}
                      />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ))}
      </section>
      <section aria-labelledby="storefront-cart-heading" className="grid gap-4 border-t border-border pt-6">
        <h2 className="m-0 font-[family-name:var(--font-display)] text-lg font-semibold leading-7" id="storefront-cart-heading">{copy.cartHeading}</h2>
        {recovered ? (
          <Alert>
            <AlertDescription>{copy.cartUpdated}</AlertDescription>
          </Alert>
        ) : null}
        {checkoutFailed ? (
          <Alert variant="destructive">
            <AlertDescription>{copy.cartCheckoutFailed}</AlertDescription>
          </Alert>
        ) : null}
        {items.length === 0 ? (
          <EmptyState className="max-w-[var(--layout-max)] border-transparent py-6" illustration="products" kind="empty" title={copy.cartEmpty} />
        ) : (
          <>
            <ul className="m-0 grid list-none gap-3 p-0">
              {items.map((item) => {
                if (item.kind === "product") {
                  const product = productByReference.get(item.reference);
                  if (!product) return null;
                  return (
                    <li className="flex flex-wrap items-center gap-3" key={item.reference}>
                      <div className="grid min-w-[min(100%,var(--space-12))] flex-1 gap-1">
                        <p className="m-0 font-semibold break-words">{product.title}</p>
                        <p className="m-0 text-xs tabular-nums text-muted-foreground">
                          {item.quantity} × {formatAmount(product.price, product.currencyCode)}
                        </p>
                      </div>
                      <MoneyText
                        className="font-semibold"
                        pairLabel={product.currencyCode ?? undefined}
                        value={totals.lines.get(item) ?? ""}
                      />
                      <Button
                        aria-label={`${copy.cartRemove}: ${product.title}`}
                        onClick={() => onRemove(item)}
                        size="icon"
                        type="button"
                        variant="outline"
                      >
                        <XIcon aria-hidden="true" data-icon="inline-start" />
                      </Button>
                    </li>
                  );
                }
                return (
                  <li className="flex flex-wrap items-center gap-3" key="custom-amount">
                    <div className="grid min-w-[min(100%,var(--space-12))] flex-1 gap-1">
                      <p className="m-0 font-semibold break-words">{copy.customAmountTitle}</p>
                    </div>
                    <MoneyText
                      className="font-semibold"
                      pairLabel={standalonePaymentCurrencyCode ?? undefined}
                      value={totals.lines.get(item) ?? ""}
                    />
                    <Button
                      aria-label={`${copy.cartRemove}: ${copy.customAmountTitle}`}
                      onClick={() => onRemove(item)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <XIcon aria-hidden="true" data-icon="inline-start" />
                    </Button>
                  </li>
                );
              })}
            </ul>
            <ul className="m-0 grid list-none gap-2 border-t border-border p-0 pt-4">
              {totals.groups.map((group) => (
                <li className="flex flex-wrap items-center justify-between gap-3 tabular-nums" key={group.currencyCode ?? "unlabeled"}>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {copy.cartTotalLabel}
                    {group.currencyCode ? ` (${group.currencyCode})` : ""}
                  </span>
                  <strong>
                    <MoneyText pairLabel={group.currencyCode ?? undefined} value={group.total} />
                  </strong>
                </li>
              ))}
            </ul>
            {!customAmountInCart ? (
              <Button
                aria-busy={checkoutPending || undefined}
                disabled={checkoutPending}
                onClick={onCheckout}
                type="button"
              >
                {copy.cartCheckout}
              </Button>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

// The single client boundary of the public storefront: it owns the slug-scoped
// versioned browser cart, hydration-time stale-item recovery, every cart
// mutation, and the product-only cart checkout submission (clear only this
// store's key on issuance, then redirect). The server-rendered catalog snapshot
// is the only catalog truth.
export function StorefrontExperience({
  catalog,
  copy,
  layout,
  slug,
  standalonePaymentCurrencyCode,
  standalonePayments,
}: Readonly<{
  catalog: readonly PublicStorefrontCatalogGroup[];
  copy: StorefrontExperienceCopy;
  layout: string;
  slug: string;
  standalonePaymentCurrencyCode: string | null;
  standalonePayments: boolean;
}>) {
  const [items, setItems] = useState<readonly StorefrontCartItem[]>([]);
  const [recovered, setRecovered] = useState(false);
  const [amountDraft, setAmountDraft] = useState("");
  const [amountInvalid, setAmountInvalid] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutFailed, setCheckoutFailed] = useState(false);
  const catalogProducts = useMemo(() => catalog.flatMap((group) => group.products), [catalog]);
  const storageKey = storefrontCartStorageKey(slug);
  // The pay link carries the draft amount as prefill only, and only while it
  // matches the canonical amount grammar; the pay page and 9.2.1 revalidate it.
  const payHref = `/store/${slug}/pay${isStorefrontCartAmount(amountDraft) ? `?amount=${encodeURIComponent(amountDraft)}` : ""}`;

  useEffect(() => {
    const hydration = hydrateStorefrontCart(readStorage(storageKey), catalogProducts, standalonePayments);
    if (hydration.recovered) writeStorage(storageKey, serializeStorefrontCart(hydration.items));
    // The stored cart is external state read once after mount; applying it in
    // a queued callback keeps the first client render identical to the server
    // render and avoids a synchronous cascading render inside the effect.
    queueMicrotask(() => {
      setItems(hydration.items);
      setRecovered(hydration.recovered);
      const storedAmount = hydration.items.find((item) => item.kind === "custom-amount");
      if (storedAmount) setAmountDraft(storedAmount.amount);
    });
  }, [storageKey, catalogProducts, standalonePayments]);

  const persist = (next: readonly StorefrontCartItem[]) => {
    setItems(next);
    writeStorage(storageKey, serializeStorefrontCart(next));
  };

  const clearStorage = () => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // See readStorage: storage denial degrades to session-memory.
    }
  };

  return (
    <StorefrontExperienceView
      amountDraft={amountDraft}
      amountInvalid={amountInvalid}
      catalog={catalog}
      checkoutFailed={checkoutFailed}
      checkoutPending={checkoutPending}
      copy={copy}
      items={items}
      layout={layout}
      onAmountDraftChange={(value) => {
        setAmountDraft(value);
        setAmountInvalid(false);
      }}
      onAmountSubmit={() => {
        if (!isStorefrontCartAmount(amountDraft)) {
          setAmountInvalid(true);
          return;
        }
        setAmountInvalid(false);
        persist(setStorefrontCartCustomAmount(items, amountDraft));
      }}
      onCheckout={() => {
        if (checkoutPending) return;
        setCheckoutFailed(false);
        setCheckoutPending(true);
        void submitStorefrontCartCheckout(slug, items).then((outcome) => {
          if (outcome.kind === "issued") {
            // Success clears only this store's cart key, then redirects to the
            // canonical public link route; the pending state rides the navigation.
            clearStorage();
            setItems([]);
            window.location.assign(`/pay/${outcome.paymentLinkIdentifier}`);
            return;
          }
          setCheckoutPending(false);
          setCheckoutFailed(true);
        });
      }}
      onQuantityCommit={(reference, quantity) => persist(setStorefrontCartProductQuantity(items, reference, quantity))}
      onRemove={(item) => persist(item.kind === "product"
        ? setStorefrontCartProductQuantity(items, item.reference, 0)
        : setStorefrontCartCustomAmount(items, null))}
      payHref={payHref}
      recovered={recovered}
      standalonePaymentCurrencyCode={standalonePaymentCurrencyCode}
      standalonePayments={standalonePayments}
    />
  );
}

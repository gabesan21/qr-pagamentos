"use client";

import { MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { PublicStorefrontCatalogGroup, PublicStorefrontCatalogProduct } from "@/storefront/public-storefront";

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
    <div className="storefront-stepper">
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
        className="storefront-stepper__input"
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

  const customAmountField = (
    <div className="storefront-custom-amount__field">
      <label className="storefront-custom-amount__label" htmlFor="storefront-custom-amount">
        {copy.customAmountLabel}{standalonePaymentCurrencyCode ? ` (${standalonePaymentCurrencyCode})` : ""}
      </label>
      <Input
        aria-describedby={amountInvalid ? "storefront-custom-amount-error" : undefined}
        aria-invalid={amountInvalid || undefined}
        autoComplete="off"
        id="storefront-custom-amount"
        inputMode="decimal"
        onChange={(event) => onAmountDraftChange(event.target.value)}
        value={amountDraft}
      />
      {amountInvalid ? (
        <p className="storefront-custom-amount__error" id="storefront-custom-amount-error" role="alert">
          {copy.customAmountInvalid}
        </p>
      ) : null}
    </div>
  );
  const customAmountAction = (
    <Button onClick={onAmountSubmit} type="button">
      {customAmountInCart ? copy.customAmountUpdate : copy.customAmountAdd}
    </Button>
  );

  return (
    <div className="storefront-experience">
      <section aria-label={copy.productsHeading} className="storefront-products" data-layout={layout}>
        <h2 className="storefront-products__heading">{copy.productsHeading}</h2>
        {standalonePayments ? (
          layout === "table" ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.customAmountTitle}</TableHead>
                  <TableHead>{copy.customAmountLabel}{standalonePaymentCurrencyCode ? ` (${standalonePaymentCurrencyCode})` : ""}</TableHead>
                  <TableHead><span className="sr-only">{copy.customAmountAdd}</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell><p className="storefront-product-description">{copy.customAmountDescription}</p></TableCell>
                  <TableCell>{customAmountField}</TableCell>
                  <TableCell>{customAmountAction}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <Card className="storefront-card">
              <CardHeader>
                <CardTitle>{copy.customAmountTitle}</CardTitle>
                <CardDescription className="storefront-product-description">{copy.customAmountDescription}</CardDescription>
              </CardHeader>
              <CardContent>{customAmountField}</CardContent>
              <CardFooter>{customAmountAction}</CardFooter>
            </Card>
          )
        ) : null}
        {catalog.map((group) => (
          <section className="storefront-group" key={group.name ?? "uncategorized"}>
            <h3 className="storefront-group__heading">{group.name ?? copy.groupUncategorized}</h3>
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
                        <p className="storefront-product-name">{product.title}</p>
                        <p className="storefront-product-description">{product.description}</p>
                      </TableCell>
                      <TableCell className="storefront-price">{formatAmount(product.price, product.currencyCode)}</TableCell>
                      <TableCell>
                        <QuantityStepper copy={copy} onCommit={(quantity) => onQuantityCommit(product.reference, quantity)} quantity={quantityFor(product.reference)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="storefront-products__list">
                {group.products.map((product) => (
                  <Card className="storefront-card" key={product.reference}>
                    {product.imageMediaIdentifier ? (
                      <img alt="" className="storefront-product-image" src={`/media/${product.imageMediaIdentifier}`} />
                    ) : null}
                    <CardHeader>
                      <CardTitle>{product.title}</CardTitle>
                      <CardDescription className="storefront-product-description">{product.description}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="storefront-price"><span>{copy.priceLabel}</span> {formatAmount(product.price, product.currencyCode)}</p>
                    </CardContent>
                    <CardFooter>
                      <QuantityStepper copy={copy} onCommit={(quantity) => onQuantityCommit(product.reference, quantity)} quantity={quantityFor(product.reference)} />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </section>
        ))}
      </section>
      <section aria-labelledby="storefront-cart-heading" className="storefront-cart">
        <h2 className="storefront-cart__heading" id="storefront-cart-heading">{copy.cartHeading}</h2>
        {recovered ? (
          <Alert><AlertDescription>{copy.cartUpdated}</AlertDescription></Alert>
        ) : null}
        {checkoutFailed ? (
          <Alert variant="destructive"><AlertDescription>{copy.cartCheckoutFailed}</AlertDescription></Alert>
        ) : null}
        {items.length === 0 ? (
          <p className="storefront-cart__empty">{copy.cartEmpty}</p>
        ) : (
          <>
            <ul className="storefront-cart__lines">
              {items.map((item) => {
                if (item.kind === "product") {
                  const product = productByReference.get(item.reference);
                  if (!product) return null;
                  return (
                    <li className="storefront-cart__line" key={item.reference}>
                      <div className="storefront-cart__facts">
                        <p className="storefront-cart__name">{product.title}</p>
                        <p className="storefront-cart__detail">{item.quantity} × {formatAmount(product.price, product.currencyCode)}</p>
                      </div>
                      <p className="storefront-cart__amount">{formatAmount(totals.lines.get(item) ?? "", product.currencyCode)}</p>
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
                  <li className="storefront-cart__line" key="custom-amount">
                    <div className="storefront-cart__facts">
                      <p className="storefront-cart__name">{copy.customAmountTitle}</p>
                    </div>
                    <p className="storefront-cart__amount">{formatAmount(totals.lines.get(item) ?? "", standalonePaymentCurrencyCode)}</p>
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
            <ul className="storefront-cart__totals">
              {totals.groups.map((group) => (
                <li className="storefront-cart__total" key={group.currencyCode ?? "unlabeled"}>
                  <span>{copy.cartTotalLabel}{group.currencyCode ? ` (${group.currencyCode})` : ""}</span>{" "}
                  <strong>{group.total}</strong>
                </li>
              ))}
            </ul>
            {!customAmountInCart ? (
              <Button
                aria-busy={checkoutPending || undefined}
                className="storefront-cart__checkout"
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
      recovered={recovered}
      standalonePaymentCurrencyCode={standalonePaymentCurrencyCode}
      standalonePayments={standalonePayments}
    />
  );
}

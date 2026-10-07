"use client";

import { LayoutGridIcon, ListIcon, XIcon, MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MoneyText } from "@/components/ui/money-text";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { paginateStorefrontCatalog } from "@/storefront/catalog-page";
import {
  STOREFRONT_CART_QUANTITY_MAXIMUM,
  hydrateStorefrontCart,
  isStorefrontCartAmount,
  serializeStorefrontCart,
  setStorefrontCartProductQuantity,
  storefrontCartStorageKey,
  storefrontCartTotals,
  type StorefrontCartItem,
} from "@/storefront/cart";
import type { PublicStorefrontCatalogGroup } from "@/storefront/public-storefront";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";
import { formatPublicMoney } from "@/lib/public-money-display";
import type { CheckoutDataPolicy } from "@/orders/order-v2-policies";

import { canonicalStandaloneBrlInput, StandaloneBrlAmountInput, StandalonePaymentExperience } from "./pay/standalone-payment-experience";

export type StorefrontView = "cards" | "list";

export type StorefrontExperienceCopy = Readonly<{
  cartCheckout: string;
  cartCheckoutFailed: string;
  cartEmpty: string;
  cartHeading: string;
  cartRemove: string;
  cartTotalLabel: string;
  cartUpdated: string;
  customAmountDescription: string;
  customAmountInvalid: string;
  customAmountLabel: string;
  customAmountPlaceholder: string;
  customAmountPay: string;
  customAmountTitle: string;
  decreaseQuantity: string;
  groupUncategorized: string;
  increaseQuantity: string;
  paginationLabel: string;
  paginationNext: string;
  paginationPrevious: string;
  paginationStatus: string;
  priceLabel: string;
  productsHeading: string;
  quantityLabel: string;
  viewCards: string;
  viewLabel: string;
  viewList: string;
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

function canonicalCustomAmount(draft: string, currencyCode: string | null): string {
  return currencyCode === "BRL" ? canonicalStandaloneBrlInput(draft) : draft;
}

export function standalonePaymentPrefillHref(slug: string, amount: string): string | null {
  return isStorefrontCartAmount(amount) ? `/store/${slug}/pay?amount=${encodeURIComponent(amount)}` : null;
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
  if (items.length === 0) return { kind: "failed" };
  let response: Response;
  try {
    response = await fetchImplementation(`/api/store/${slug}/cart/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: items.map((item) => ({ reference: item.reference, quantity: item.quantity })) }),
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

// The free-amount field renders its label, the input and the submit action on
// one row, with the validation error below; the surrounding form owns submit.
function CustomAmountField({
  action,
  amountDraft,
  amountInvalid,
  copy,
  currencyCode,
  onChange,
}: Readonly<{
  action: ReactNode;
  amountDraft: string;
  amountInvalid: boolean;
  copy: StorefrontExperienceCopy;
  currencyCode: string | null;
  onChange: (value: string) => void;
}>) {
  return (
    <Field className="grid max-w-[var(--layout-max)] gap-2" data-invalid={amountInvalid || undefined}>
      <FieldLabel htmlFor="storefront-custom-amount">
        {copy.customAmountLabel}
        {currencyCode ? ` (${currencyCode})` : ""}
      </FieldLabel>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {currencyCode === "BRL" ? (
            <StandaloneBrlAmountInput
              amountInvalid={amountInvalid}
              disabled={false}
              errorId="storefront-custom-amount-error"
              id="storefront-custom-amount"
              name=""
              onAmountChange={onChange}
              placeholder={copy.customAmountPlaceholder}
              value={amountDraft}
            />
          ) : (
            <Input
              aria-describedby={amountInvalid ? "storefront-custom-amount-error" : undefined}
              aria-invalid={amountInvalid || undefined}
              autoComplete="off"
              id="storefront-custom-amount"
              inputMode="decimal"
              onChange={(event) => onChange(event.target.value)}
              value={amountDraft}
            />
          )}
        </div>
        {action}
      </div>
      {amountInvalid ? (
        <FieldError id="storefront-custom-amount-error">{copy.customAmountInvalid}</FieldError>
      ) : null}
    </Field>
  );
}

// An empty catalog has a deliberately separate mounted payment surface. It
// never hydrates or mutates the browser cart, so its amount and attempt state
// cannot leak into a catalog storefront.
export function StandaloneStorefrontExperience({
  currencyCode,
  dictionary,
  policy,
  slug,
}: Readonly<{
  currencyCode: string | null;
  dictionary: ReturnType<typeof getDictionary>;
  policy: CheckoutDataPolicy;
  slug: string;
}>) {
  return (
    <StandalonePaymentExperience
      currencyCode={currencyCode}
      dictionary={dictionary}
      flow="storefront"
      policy={policy}
      prefillAmount={null}
      slug={slug}
    />
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
  locale = "pt-BR",
  onAmountDraftChange,
  onAmountSubmit,
  onCheckout,
  onPageChange,
  onQuantityCommit,
  onRemove,
  onViewChange,
  page,
  recovered,
  standalonePaymentCurrencyCode,
  standalonePayments,
  view,
}: Readonly<{
  amountDraft: string;
  amountInvalid: boolean;
  catalog: readonly PublicStorefrontCatalogGroup[];
  checkoutFailed: boolean;
  checkoutPending: boolean;
  copy: StorefrontExperienceCopy;
  locale?: SupportedLocale;
  items: readonly StorefrontCartItem[];
  onAmountDraftChange: (value: string) => void;
  onAmountSubmit: () => void;
  onCheckout: () => void;
  onPageChange: (page: number) => void;
  onQuantityCommit: QuantityCommit;
  onRemove: (item: StorefrontCartItem) => void;
  onViewChange: (view: StorefrontView) => void;
  page: number;
  recovered: boolean;
  standalonePaymentCurrencyCode: string | null;
  standalonePayments: boolean;
  view: StorefrontView;
}>) {
  const catalogProducts = catalog.flatMap((group) => group.products);
  const productByReference = new Map(catalogProducts.map((product) => [product.reference, product]));
  const quantityFor = (reference: string) => items.find((entry) => entry.reference === reference)?.quantity ?? 0;
  const totals = storefrontCartTotals(items, catalogProducts);
  const { groups, page: currentPage, pageCount } = paginateStorefrontCatalog(catalog, page);

  // Below `lg` the DOM order is free amount, catalog, cart; at `lg`+ the catalog
  // takes the left column and the free amount / cart stack on the right.
  return (
    <div
      className={`grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_calc(var(--space-12)*8)] ${standalonePayments ? "lg:grid-rows-[auto_1fr]" : ""}`}
    >
      {standalonePayments ? (
        <section aria-labelledby="storefront-custom-amount-heading" className="lg:col-start-2 lg:row-start-1">
          <Card className="w-full">
            <CardHeader>
              <CardTitle id="storefront-custom-amount-heading">{copy.customAmountTitle}</CardTitle>
              <CardDescription className="max-w-[var(--layout-max)] whitespace-pre-wrap">{copy.customAmountDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {/* The amount never enters the cart: submitting navigates to the
                  standalone pay page, which revalidates it as prefill only. */}
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  onAmountSubmit();
                }}
              >
                <CustomAmountField
                  action={<Button type="submit">{copy.customAmountPay}</Button>}
                  amountDraft={amountDraft}
                  amountInvalid={amountInvalid}
                  copy={copy}
                  currencyCode={standalonePaymentCurrencyCode}
                  onChange={onAmountDraftChange}
                />
              </form>
            </CardContent>
          </Card>
        </section>
      ) : null}
      <section
        aria-labelledby="storefront-products-heading"
        className={`grid min-w-0 gap-5 lg:col-start-1 lg:row-start-1 ${standalonePayments ? "lg:row-span-2" : ""}`}
        data-view={view}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="m-0 font-display text-lg font-semibold leading-7" id="storefront-products-heading">{copy.productsHeading}</h2>
          <div aria-label={copy.viewLabel} className="flex gap-2" role="group">
            <Button aria-pressed={view === "cards"} onClick={() => onViewChange("cards")} type="button" variant={view === "cards" ? "secondary" : "outline"}>
              <LayoutGridIcon aria-hidden="true" data-icon="inline-start" />
              {copy.viewCards}
            </Button>
            <Button aria-pressed={view === "list"} onClick={() => onViewChange("list")} type="button" variant={view === "list" ? "secondary" : "outline"}>
              <ListIcon aria-hidden="true" data-icon="inline-start" />
              {copy.viewList}
            </Button>
          </div>
        </div>
        {groups.map((group) => (
          <section className="grid gap-4" key={group.name ?? "uncategorized"}>
            <h3 className="m-0 break-words text-sm font-semibold">{group.name ?? copy.groupUncategorized}</h3>
            {view === "list" ? (
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
                        <MoneyText value={formatPublicMoney(product.price, product.currencyCode, locale)} />
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
              <div className="grid gap-5 sm:grid-cols-2">
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
                        <MoneyText value={formatPublicMoney(product.price, product.currencyCode, locale)} />
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
        {pageCount > 1 ? (
          <Pagination label={copy.paginationLabel}>
            <PaginationContent>
              <PaginationItem>
                <Button disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} type="button" variant="outline">
                  {copy.paginationPrevious}
                </Button>
              </PaginationItem>
              <PaginationItem>
                <span aria-live="polite" className="text-sm tabular-nums text-muted-foreground">
                  {copy.paginationStatus.replace("{page}", String(currentPage)).replace("{total}", String(pageCount))}
                </span>
              </PaginationItem>
              <PaginationItem>
                <Button disabled={currentPage === pageCount} onClick={() => onPageChange(currentPage + 1)} type="button" variant="outline">
                  {copy.paginationNext}
                </Button>
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </section>
      <section
        aria-labelledby="storefront-cart-heading"
        className={`lg:col-start-2 ${standalonePayments ? "lg:row-start-2" : "lg:row-start-1"}`}
      >
        <Card className="w-full">
          <CardHeader>
            <CardTitle id="storefront-cart-heading">{copy.cartHeading}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
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
                    const product = productByReference.get(item.reference);
                    if (!product) return null;
                    return (
                      <li className="flex flex-wrap items-center gap-3" key={item.reference}>
                        <div className="grid min-w-[min(100%,var(--space-12))] flex-1 gap-1">
                          <p className="m-0 font-semibold break-words">{product.title}</p>
                          <p className="m-0 text-xs tabular-nums text-muted-foreground">
                            {item.quantity} × {formatPublicMoney(product.price, product.currencyCode, locale)}
                          </p>
                        </div>
                        <MoneyText
                          className="font-semibold"
                          value={formatPublicMoney(totals.lines.get(item) ?? "", product.currencyCode, locale)}
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
                        <MoneyText value={formatPublicMoney(group.total, group.currencyCode, locale)} />
                      </strong>
                    </li>
                  ))}
                </ul>
                <Button
                  aria-busy={checkoutPending || undefined}
                  disabled={checkoutPending}
                  onClick={onCheckout}
                  type="button"
                >
                  {copy.cartCheckout}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
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
  locale,
  layout,
  slug,
  standalonePaymentCurrencyCode,
  standalonePayments,
}: Readonly<{
  catalog: readonly PublicStorefrontCatalogGroup[];
  copy: StorefrontExperienceCopy;
  locale: SupportedLocale;
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
  // The owner's layout setting picks the starting view; the buyer's toggle is
  // per-visit and never persisted.
  const [view, setView] = useState<StorefrontView>(layout === "table" ? "list" : "cards");
  const [page, setPage] = useState(1);
  const catalogProducts = useMemo(() => catalog.flatMap((group) => group.products), [catalog]);
  const storageKey = storefrontCartStorageKey(slug);
  const canonicalAmount = canonicalCustomAmount(amountDraft, standalonePaymentCurrencyCode);

  useEffect(() => {
    const hydration = hydrateStorefrontCart(readStorage(storageKey), catalogProducts);
    if (hydration.recovered) writeStorage(storageKey, serializeStorefrontCart(hydration.items));
    // The stored cart is external state read once after mount; applying it in
    // a queued callback keeps the first client render identical to the server
    // render and avoids a synchronous cascading render inside the effect.
    queueMicrotask(() => {
      setItems(hydration.items);
      setRecovered(hydration.recovered);
    });
  }, [storageKey, catalogProducts]);

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
      locale={locale}
      onAmountDraftChange={(value) => {
        setAmountDraft(value);
        setAmountInvalid(false);
      }}
      // "Pay now": the amount never enters the cart. It rides the query as
      // prefill only and is revalidated by the pay page and by 9.2.1.
      onAmountSubmit={() => {
        const href = standalonePaymentPrefillHref(slug, canonicalAmount);
        if (!href) {
          setAmountInvalid(true);
          return;
        }
        setAmountInvalid(false);
        window.location.assign(href);
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
      onPageChange={(next) => {
        setPage(next);
        document.getElementById("storefront-products-heading")?.scrollIntoView({ block: "start" });
      }}
      onQuantityCommit={(reference, quantity) => persist(setStorefrontCartProductQuantity(items, reference, quantity))}
      onRemove={(item) => persist(setStorefrontCartProductQuantity(items, item.reference, 0))}
      onViewChange={setView}
      page={page}
      recovered={recovered}
      standalonePaymentCurrencyCode={standalonePaymentCurrencyCode}
      standalonePayments={standalonePayments}
      view={view}
    />
  );
}

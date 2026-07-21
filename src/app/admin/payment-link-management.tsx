"use client";

import { useEffect, useState } from "react";

import { formatProductPrice } from "@/app/admin/product-management";
import type { PaymentLinkAdminData } from "@/auth/payment-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import type { getDictionary } from "@/i18n/dictionaries";
import type { SupportedLocale } from "@/i18n/locales";

type Dictionary = ReturnType<typeof getDictionary>;

export function PaymentLinkManagement({ data, dictionary, locale }: Readonly<{ data: PaymentLinkAdminData; dictionary: Dictionary; locale: SupportedLocale }>) {
  const hasPrerequisites = data.activeProducts.length > 0 && data.activeCurrencyPairs.length > 0;
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.adminPaymentLinksHeading}</CardTitle><CardDescription>{dictionary.adminPaymentLinksDescription}</CardDescription></CardHeader>
      <CardContent>
        {hasPrerequisites ? <PaymentLinkForm data={data} dictionary={dictionary} locale={locale} /> : <Alert><AlertTitle>{dictionary.adminPaymentLinksUnavailable}</AlertTitle><AlertDescription>{dictionary.adminPaymentLinksUnavailableDescription}</AlertDescription></Alert>}
        <Separator />
        {data.links.length === 0 ? <Alert><AlertTitle>{dictionary.adminPaymentLinksEmpty}</AlertTitle><AlertDescription>{dictionary.adminPaymentLinksEmptyDescription}</AlertDescription></Alert> : <div className="admin-product-list" role="list">{data.links.map((link) => <PaymentLink data={link} dictionary={dictionary} key={link.id} locale={locale} />)}</div>}
      </CardContent>
    </Card>
  );
}

function PaymentLinkForm({ data, dictionary, locale }: Readonly<{ data: PaymentLinkAdminData; dictionary: Dictionary; locale: SupportedLocale }>) {
  const formId = "payment-link-create";
  return (
    <form action="/admin/payment-links" id={formId} method="post">
      <FieldGroup>
        <Field><FieldLabel htmlFor="payment-link-product">{dictionary.adminPaymentLinkProduct}</FieldLabel><NativeSelect id="payment-link-product" name="productId" required><NativeSelectOption value="">{dictionary.adminPaymentLinkChooseProduct}</NativeSelectOption>{data.activeProducts.map((product) => <NativeSelectOption key={product.id} value={product.id}>{product.internalName} — {formatProductPrice(product.price, locale)}</NativeSelectOption>)}</NativeSelect></Field>
        <Field><FieldLabel htmlFor="payment-link-currency-pair">{dictionary.adminPaymentLinkCurrencyPair}</FieldLabel><NativeSelect id="payment-link-currency-pair" name="currencyPairId" required><NativeSelectOption value="">{dictionary.adminPaymentLinkChooseCurrencyPair}</NativeSelectOption>{data.activeCurrencyPairs.map((pair) => <NativeSelectOption key={pair.id} value={pair.id}>{pair.label}</NativeSelectOption>)}</NativeSelect></Field>
        <Field><FieldLabel htmlFor="payment-link-type">{dictionary.adminPaymentLinkType}</FieldLabel><NativeSelect defaultValue="REUSABLE" id="payment-link-type" name="linkType"><NativeSelectOption value="REUSABLE">{dictionary.adminPaymentLinkReusable}</NativeSelectOption><NativeSelectOption value="SINGLE_USE">{dictionary.adminPaymentLinkSingleUse}</NativeSelectOption></NativeSelect></Field>
        <Field><FieldLabel htmlFor="payment-link-expiry">{dictionary.adminPaymentLinkExpiry}</FieldLabel><Input aria-describedby="payment-link-expiry-help" id="payment-link-expiry" name="expiresAt" type="datetime-local" /><FieldDescription id="payment-link-expiry-help">{dictionary.adminPaymentLinkExpiryHelp}</FieldDescription></Field>
        <PaymentLinkSubmit form={formId} label={dictionary.adminPaymentLinkCreate} />
      </FieldGroup>
    </form>
  );
}

function PaymentLink({ data, dictionary, locale }: Readonly<{ data: PaymentLinkAdminData["links"][number]; dictionary: Dictionary; locale: SupportedLocale }>) {
  const formId = `payment-link-${data.id}-revoke`;
  return (
    <section aria-labelledby={`payment-link-${data.id}`} className="admin-product" role="listitem">
      <div className="admin-product__facts">
        <h3 id={`payment-link-${data.id}`}>{data.identifier}</h3>
        <Badge variant={data.active ? "secondary" : "destructive"}>{data.active ? dictionary.adminActive : dictionary.adminDisabled}</Badge>
        <dl>
          <div><dt>{dictionary.adminPaymentLinkType}</dt><dd>{data.linkType === "SINGLE_USE" ? dictionary.adminPaymentLinkSingleUse : dictionary.adminPaymentLinkReusable}</dd></div>
          <div><dt>{dictionary.adminPaymentLinkProduct}</dt><dd>{data.product.internalName} — {formatProductPrice(data.product.price, locale)}</dd></div>
          <div><dt>{dictionary.adminPaymentLinkCurrencyPair}</dt><dd>{data.currencyPair.label}</dd></div>
          <div><dt>{dictionary.adminPaymentLinkExpiry}</dt><dd>{data.expiresAt ? data.expiresAt.toLocaleString(locale) : dictionary.adminPaymentLinkNoExpiry}</dd></div>
        </dl>
      </div>
      {data.active ? <form action={`/admin/payment-links/${data.id}`} id={formId} method="post"><details><summary>{dictionary.adminPaymentLinkRevokeHeading}</summary><Alert variant="warning"><AlertTitle>{dictionary.adminPaymentLinkRevokeConfirm}</AlertTitle><AlertDescription>{dictionary.adminPaymentLinkRevokeDescription}</AlertDescription><PaymentLinkSubmit form={formId} label={dictionary.adminPaymentLinkRevoke} tone="secondary" /></Alert></details></form> : null}
    </section>
  );
}

function PaymentLinkSubmit({ form, label, tone = "primary" }: Readonly<{ form: string; label: string; tone?: "primary" | "secondary" }>) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const nativeForm = document.getElementById(form);
    if (!(nativeForm instanceof HTMLFormElement)) return;
    const observeNativeSubmit = () => setPending(true);
    nativeForm.addEventListener("submit", observeNativeSubmit);
    return () => nativeForm.removeEventListener("submit", observeNativeSubmit);
  }, [form]);
  return <Button aria-busy={pending || undefined} disabled={pending} form={form} type="submit" variant={tone === "secondary" ? "outline" : "default"}>{pending ? <Spinner data-icon="inline-start" /> : null}{label}</Button>;
}

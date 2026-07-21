"use client";

import { useEffect, useState } from "react";

import type { CheckoutDataPolicy } from "@/auth/checkout-policy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

export function CheckoutPolicyManagement({ dictionary, policy }: Readonly<{ dictionary: Dictionary; policy: CheckoutDataPolicy }>) {
  const formId = "checkout-policy";
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const submit = () => setPending(true);
    form.addEventListener("submit", submit);
    return () => form.removeEventListener("submit", submit);
  }, []);
  const labels: Record<CheckoutDataPolicy, string> = { NONE: dictionary.checkoutPolicyNone, NAME_EMAIL: dictionary.checkoutPolicyNameEmail, EMAIL: dictionary.checkoutPolicyEmail, NAME_EMAIL_CPF: dictionary.checkoutPolicyNameEmailCpf, NAME_EMAIL_CPF_ADDRESS: dictionary.checkoutPolicyNameEmailCpfAddress };
  return <Card><CardHeader><CardTitle>{dictionary.checkoutPolicyHeading}</CardTitle><CardDescription>{dictionary.checkoutPolicyDescription}</CardDescription></CardHeader><CardContent><form action="/checkout-policy" id={formId} method="post"><FieldGroup><Field data-disabled={pending || undefined}><FieldLabel htmlFor="checkout-data-policy">{dictionary.checkoutPolicyLabel}</FieldLabel><NativeSelect defaultValue={policy} disabled={pending} id="checkout-data-policy" name="checkoutDataPolicy">{Object.entries(labels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field><Button aria-busy={pending || undefined} disabled={pending} form={formId} type="submit">{pending ? <Spinner data-icon="inline-start" /> : null}{dictionary.checkoutPolicySave}</Button></FieldGroup></form></CardContent></Card>;
}

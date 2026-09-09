"use client";

import { useEffect, useState } from "react";

import type { CheckoutDataPolicy } from "@/auth/checkout-policy";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

type Dictionary = ReturnType<typeof getDictionary>;

const POLICY_ORDER: readonly CheckoutDataPolicy[] = ["NONE", "NAME_EMAIL", "EMAIL", "NAME_EMAIL_CPF", "NAME_EMAIL_CPF_ADDRESS"];

const POLICY_FIELD_KEYS: Readonly<Record<CheckoutDataPolicy, readonly (keyof Dictionary)[]>> = {
  NONE: [],
  NAME_EMAIL: ["checkoutPolicyFieldName", "checkoutPolicyFieldEmail"],
  EMAIL: ["checkoutPolicyFieldEmail"],
  NAME_EMAIL_CPF: ["checkoutPolicyFieldName", "checkoutPolicyFieldEmail", "checkoutPolicyFieldCpf"],
  NAME_EMAIL_CPF_ADDRESS: [
    "checkoutPolicyFieldName",
    "checkoutPolicyFieldEmail",
    "checkoutPolicyFieldCpf",
    "checkoutPolicyFieldAddress",
  ],
};

// Five radio cards, `EMAIL` included alongside the four template options: the
// production policy set has no template counterpart, so it renders with the
// same card shape and field-chip list as the rest instead of a dead extra
// control.
export function CheckoutPolicyManagement({ dictionary, policy }: Readonly<{ dictionary: Dictionary; policy: CheckoutDataPolicy }>) {
  const formId = "checkout-policy";
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<CheckoutDataPolicy>(policy);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    const submit = () => setPending(true);
    form.addEventListener("submit", submit);
    return () => form.removeEventListener("submit", submit);
  }, []);

  const labels: Record<CheckoutDataPolicy, string> = {
    NONE: dictionary.checkoutPolicyNone,
    NAME_EMAIL: dictionary.checkoutPolicyNameEmail,
    EMAIL: dictionary.checkoutPolicyEmail,
    NAME_EMAIL_CPF: dictionary.checkoutPolicyNameEmailCpf,
    NAME_EMAIL_CPF_ADDRESS: dictionary.checkoutPolicyNameEmailCpfAddress,
  };

  return (
    <Card>
      <CardContent>
        <form action="/checkout-policy" id={formId} method="post">
          <Field data-disabled={pending || undefined}>
            <FieldLabel>{dictionary.checkoutPolicyLabel}</FieldLabel>
            <div aria-label={dictionary.checkoutPolicyLabel} className="grid gap-3 sm:grid-cols-2" role="radiogroup">
              {POLICY_ORDER.map((value) => {
                const isSelected = selected === value;
                const fields = POLICY_FIELD_KEYS[value];
                return (
                  <button
                    aria-checked={isSelected}
                    className={cn(
                      "rounded-lg border border-border bg-card p-4 text-left transition-colors",
                      isSelected ? "border-primary ring-3 ring-ring" : "hover:border-muted-foreground",
                      pending && "pointer-events-none opacity-50",
                    )}
                    disabled={pending}
                    key={value}
                    onClick={() => setSelected(value)}
                    role="radio"
                    type="button"
                  >
                    <p className="text-sm font-medium text-foreground">{labels[value]}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {fields.length === 0 ? (
                        <span className="text-xs text-muted-foreground">{dictionary.checkoutPolicyFieldsNone}</span>
                      ) : (
                        fields.map((key) => (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground" key={key}>
                            {dictionary[key] as string}
                          </span>
                        ))
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>
          <input name="checkoutDataPolicy" type="hidden" value={selected} />
          <div className="mt-4 flex justify-end">
            <Button aria-busy={pending || undefined} disabled={pending} form={formId} type="submit">
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {dictionary.checkoutPolicySave}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

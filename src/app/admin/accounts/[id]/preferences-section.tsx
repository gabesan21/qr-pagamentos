"use client";

import { useState } from "react";
import { CheckCircle2Icon } from "lucide-react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { SegmentedControl } from "@/app/admin/admin-controls";
// Type-only: this client boundary must never pull `@/auth/checkout-policy`'s
// runtime module (it imports the database client) into the browser bundle —
// `CHECKOUT_POLICY_LABELS` below is the client-safe closed enumeration.
import type { CheckoutDataPolicy } from "@/auth/checkout-policy";
import type { AdminUserDetail } from "@/auth/admin-user-directory";
import { Field } from "@/components/ui/field";
import type { getDictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";

type Dictionary = ReturnType<typeof getDictionary>;

const CHECKOUT_POLICY_LABELS: Readonly<Record<CheckoutDataPolicy, keyof Dictionary>> = {
  NONE: "checkoutPolicyNone",
  NAME_EMAIL: "checkoutPolicyNameEmail",
  EMAIL: "checkoutPolicyEmail",
  NAME_EMAIL_CPF: "checkoutPolicyNameEmailCpf",
  NAME_EMAIL_CPF_ADDRESS: "checkoutPolicyNameEmailCpfAddress",
};

function LocaleField({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  const initial = detail.editor.preferredLocale ?? "";
  const [locale, setLocale] = useState(initial);

  return (
    <form action={`/admin/users/${detail.id}/locale`} method="post">
      <Field>
        <SegmentedControl
          ariaLabel={dictionary.adminUserProfileLocaleLabel}
          name="locale"
          onChange={setLocale}
          options={[
            { value: "", label: dictionary.adminUserProfileLocaleClear },
            { value: "pt-BR", label: "Português (Brasil)" },
            { value: "en", label: "English" },
          ]}
          value={locale}
        />
      </Field>
      <div className="mt-4 flex justify-end">
        <AdminSubmit disabled={locale === initial} label={dictionary.adminUserProfileLocaleSave} tone="secondary" />
      </div>
    </form>
  );
}

// Checkout policy renders as the template's selectable card grid, one radio
// role per option, posting the same closed policy set the byte-frozen route
// already accepts.
function CheckoutPolicyField({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  const initial = detail.editor.checkoutDataPolicy as CheckoutDataPolicy;
  const [policy, setPolicy] = useState<CheckoutDataPolicy>(initial);
  const labelId = `checkout-policy-label-${detail.id}`;

  return (
    <form action={`/admin/users/${detail.id}/checkout-policy`} method="post">
      <p className="text-sm font-medium" id={labelId}>{dictionary.checkoutPolicyLabel}</p>
      <div aria-labelledby={labelId} className="mt-2 grid gap-3 sm:grid-cols-2" role="radiogroup">
        {(Object.keys(CHECKOUT_POLICY_LABELS) as readonly CheckoutDataPolicy[]).map((value) => {
          const selected = value === policy;
          return (
            <button
              aria-checked={selected}
              className={cn(
                "min-h-11 rounded-lg border p-4 text-left transition-shadow",
                selected ? "border-primary ring-3 ring-ring" : "border-border hover:border-muted-foreground",
              )}
              key={value}
              onClick={() => setPolicy(value)}
              role="radio"
              type="button"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{dictionary[CHECKOUT_POLICY_LABELS[value]]}</span>
                {selected ? <CheckCircle2Icon aria-hidden className="size-4 shrink-0 text-primary" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <input name="policy" type="hidden" value={policy} />
      <div className="mt-4 flex justify-end">
        <AdminSubmit disabled={policy === initial} label={dictionary.adminUserProfileCheckoutSave} tone="secondary" />
      </div>
    </form>
  );
}

export function PreferencesSection({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{dictionary.adminUserProfileLocaleDescription}</p>
      <LocaleField detail={detail} dictionary={dictionary} />
      <div className="border-t border-border pt-6">
        <CheckoutPolicyField detail={detail} dictionary={dictionary} />
      </div>
    </div>
  );
}

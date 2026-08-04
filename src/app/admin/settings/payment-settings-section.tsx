"use client";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

import type { Dictionary, Settings } from "./settings-surface";

const PAYMENT_ROWS: readonly { key: "currencies" | "paymentMethods"; value: string; labelKey: "adminCurrencyBRL" | "adminPaymentMethodPIX" }[] = [
  { key: "currencies", value: "BRL", labelKey: "adminCurrencyBRL" },
  { key: "paymentMethods", value: "PIX", labelKey: "adminPaymentMethodPIX" },
];

export function PaymentSettingsSection({
  dictionary,
  settings,
}: Readonly<{ dictionary: Dictionary; settings: Settings }>) {
  return (
    <form action="/admin/payment-settings" method="post">
      <ul className="divide-y">
        {PAYMENT_ROWS.map((row) => (
          <li key={row.value} className="flex items-center gap-3 py-3">
            <span className="font-medium">{dictionary[row.labelKey]}</span>
            <Badge variant="outline">{dictionary.adminPrimaryCaption}</Badge>
            <span className="ml-auto flex items-center gap-2">
              <Switch
                aria-label={dictionary[row.labelKey]}
                checked={settings[row.key].includes(row.value)}
                disabled
                id={`payment-${row.value}`}
              />
              <input name={row.key} type="hidden" value={row.value} />
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <AdminSubmit disabled label={dictionary.save} />
      </div>
    </form>
  );
}

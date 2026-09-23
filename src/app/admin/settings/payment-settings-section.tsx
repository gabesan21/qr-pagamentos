"use client";

import { useState } from "react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";

import type { Dictionary, Settings } from "./settings-surface";
import { SettingsSectionNotice, type SectionNotice } from "./settings-section-notice";

const PAYMENT_ROWS: readonly { key: "currencies" | "paymentMethods"; value: string; labelKey: "adminCurrencyBRL" | "adminPaymentMethodPIX" }[] = [
  { key: "currencies", value: "BRL", labelKey: "adminCurrencyBRL" },
  { key: "paymentMethods", value: "PIX", labelKey: "adminPaymentMethodPIX" },
];

type PaymentRow = (typeof PAYMENT_ROWS)[number];

export function PaymentSettingsSection({
  dictionary,
  notice,
  settings,
}: Readonly<{ dictionary: Dictionary; notice: SectionNotice; settings: Settings }>) {
  const initial = Object.fromEntries(
    PAYMENT_ROWS.map((row) => [row.value, settings[row.key].includes(row.value)]),
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(initial);
  const [pendingOff, setPendingOff] = useState<PaymentRow | null>(null);

  const dirty = PAYMENT_ROWS.some((row) => checked[row.value] !== initial[row.value]);

  function requestToggle(row: PaymentRow, next: boolean) {
    // The closed catalog has one value per family: turning a row on is
    // reversible with no downstream effect, so only turning one off — which
    // removes a payment option from future products and checkout pages —
    // requires the owned confirm.
    if (!next) {
      setPendingOff(row);
      return;
    }
    setChecked((previous) => ({ ...previous, [row.value]: true }));
  }

  function confirmOff() {
    if (!pendingOff) return;
    setChecked((previous) => ({ ...previous, [pendingOff.value]: false }));
    setPendingOff(null);
  }

  return (
    <form action="/admin/payment-settings" method="post">
      <SettingsSectionNotice
        dictionary={dictionary}
        notice={notice}
        toastEntries={[
          { param: "success", value: "settings", kind: "success", message: dictionary.adminPaymentSettingsSaved },
          { param: "error", value: "settings-failed", kind: "error", message: dictionary.adminSettingsFailed },
        ]}
      />
      <ul className="divide-y">
        {PAYMENT_ROWS.map((row) => (
          <li key={row.value} className="flex items-center gap-3 py-3">
            <span className="font-medium">{dictionary[row.labelKey]}</span>
            <Badge variant="outline">{dictionary.adminPrimaryCaption}</Badge>
            <span className="ml-auto flex items-center gap-2">
              <Switch
                aria-label={dictionary[row.labelKey]}
                checked={checked[row.value]}
                id={`payment-${row.value}`}
                onCheckedChange={(next) => requestToggle(row, next)}
              />
              {checked[row.value] ? <input name={row.key} type="hidden" value={row.value} /> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-end">
        <AdminSubmit disabled={!dirty} label={dictionary.save} />
      </div>
      <ConfirmDialog
        cancelLabel={dictionary.cancel}
        confirmLabel={dictionary.adminDeactivate}
        description={dictionary.adminConfirmDeactivateBody}
        destructive
        failureMessage={dictionary.adminChangeFailed}
        onConfirm={confirmOff}
        onOpenChange={(open) => { if (!open) setPendingOff(null); }}
        open={pendingOff !== null}
        pendingLabel={dictionary.loading}
        title={dictionary.adminConfirmDeactivateTitle}
      />
    </form>
  );
}

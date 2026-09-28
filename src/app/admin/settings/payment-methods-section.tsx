"use client";

import { useId, useState } from "react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { CurrencyPair, Dictionary, ExchangeCurrencyMapping, Settings } from "./settings-surface";
import { PaymentSettingsSection } from "./payment-settings-section";
import { SettingsSectionNotice, type SectionNotice } from "./settings-section-notice";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function PaymentMethodsSection({ dictionary, mappings, methods, notice, settings }: Readonly<{
  dictionary: Dictionary;
  mappings: ExchangeCurrencyMapping[];
  methods: CurrencyPair[];
  notice: SectionNotice;
  settings: Settings;
}>) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const labelId = useId();
  const codeId = useId();
  const exchangeId = useId();

  return (
    <div className="space-y-6">
      <SettingsSectionNotice
        dictionary={dictionary}
        notice={notice}
        toastEntries={[
          { param: "success", value: "method-created", kind: "success", message: dictionary.adminMethodSaved },
          { param: "success", value: "method-changed", kind: "success", message: dictionary.adminMethodSaved },
          { param: "error", value: "method-failed", kind: "error", message: dictionary.adminMethodFailed },
        ]}
      />
      <PaymentSettingsSection dictionary={dictionary} notice={null} settings={settings} />
      {methods.length === 0 ? <p className="py-6 text-center text-sm text-text-2">{dictionary.adminEmptyRecords}</p> : <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dictionary.adminMethodName}</TableHead>
              <TableHead>{dictionary.adminCurrencyCode}</TableHead>
              <TableHead>{dictionary.adminColStatus}</TableHead>
              <TableHead className="text-right">{dictionary.adminColActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {methods.map((method) => (
              <TableRow key={method.id}>
                <TableCell>
                  {editingId === method.id ? (
                    <form action={`/admin/catalog/payment-methods/${method.id}`} className="flex items-center gap-2" method="post">
                      <Input aria-label={dictionary.adminRename} defaultValue={method.label} name="label" required />
                      <AdminSubmit label={dictionary.save} tone="secondary" />
                      <Button onClick={() => setEditingId(null)} type="button" variant="ghost">{dictionary.cancel}</Button>
                    </form>
                  ) : (
                    <><p className="m-0 font-medium">{method.label}</p><p className="m-0 font-mono text-xs text-text-2">{method.exchangeCurrencyUuid}</p></>
                  )}
                </TableCell>
                <TableCell className="text-sm">{method.currencyCode ? <span className="font-mono">{method.currencyCode}</span> : dictionary.adminMethodCurrencyInactive}</TableCell>
                <TableCell>
                  {method.isDefault ? <StatusBadge label={dictionary.adminDefaultMethod} tone="info" /> : null}
                  <StatusBadge label={method.active ? dictionary.adminStatusActive : dictionary.adminStatusInactive} tone={method.active ? "success" : "neutral"} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {editingId !== method.id ? <Button onClick={() => setEditingId(method.id)} size="sm" type="button" variant="ghost">{dictionary.adminRename}</Button> : null}
                    {method.active && !method.isDefault && method.currencyCode ? <form action={`/admin/catalog/payment-methods/${method.id}`} method="post"><input name="intent" type="hidden" value="set-default" /><input name="currencyCode" type="hidden" value={method.currencyCode} /><Button size="sm" type="submit" variant="outline">{dictionary.adminSetDefaultMethod}</Button></form> : null}
                    <form action={`/admin/catalog/payment-methods/${method.id}`} method="post">
                      <input name="intent" type="hidden" value={method.active ? "toggle-inactive" : "toggle-active"} />
                      <Button aria-describedby={method.isDefault ? `default-method-${method.id}` : undefined} disabled={method.isDefault} size="sm" type="submit" variant="outline">{method.active ? dictionary.adminDeactivate : dictionary.adminActivate}</Button>
                    </form>
                  </div>
                  {method.isDefault ? <p className="mt-2 text-xs text-text-2" id={`default-method-${method.id}`}>{dictionary.adminDefaultMethodHelp}</p> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>}
      {adding ? <NewMethodForm dictionary={dictionary} mappings={mappings} onCancel={() => setAdding(false)} ids={{ labelId, codeId, exchangeId }} setError={setError} error={error} /> : (
        <Button disabled={mappings.length === 0} onClick={() => setAdding(true)} type="button" variant="secondary">{dictionary.adminNewMethod}</Button>
      )}
    </div>
  );
}

function NewMethodForm({ dictionary, mappings, onCancel, ids, setError, error }: Readonly<{ dictionary: Dictionary; mappings: ExchangeCurrencyMapping[]; onCancel: () => void; ids: { labelId: string; codeId: string; exchangeId: string }; setError: (error: string | null) => void; error: string | null }>) {
  return <form action="/admin/catalog/payment-methods" className="rounded-card border bg-surface-2/50 p-4" method="post" onSubmit={(event) => {
    if (!UUID_RE.test(String(new FormData(event.currentTarget).get("exchangeCurrencyUuid") ?? "").trim())) { event.preventDefault(); setError(dictionary.adminUuidInvalid); }
  }}>
    {error ? <p className="mb-3 text-sm font-medium text-destructive">{error}</p> : null}
    <FieldGroup className="grid gap-4 sm:grid-cols-3">
      <Field><FieldLabel htmlFor={ids.labelId}>{dictionary.adminMethodName}</FieldLabel><Input id={ids.labelId} name="label" required /></Field>
      <Field><FieldLabel htmlFor={ids.codeId}>{dictionary.adminCurrencyCode}</FieldLabel><NativeSelect id={ids.codeId} name="currencyCode" required><NativeSelectOption disabled value="">{dictionary.adminChooseCurrency}</NativeSelectOption>{mappings.map((mapping) => <NativeSelectOption key={mapping.code} value={mapping.code}>{mapping.code}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor={ids.exchangeId}>{dictionary.adminCatalogExchangeCurrencyUuidLabel}</FieldLabel><Input id={ids.exchangeId} name="exchangeCurrencyUuid" required /><FieldDescription>{dictionary.adminCatalogUuidHelp}</FieldDescription></Field>
    </FieldGroup>
    <div className="mt-4 flex justify-end gap-2"><Button onClick={onCancel} type="button" variant="ghost">{dictionary.cancel}</Button><AdminSubmit label={dictionary.adminAdd} /></div>
  </form>;
}

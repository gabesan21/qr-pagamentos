"use client";

import { useId, useState } from "react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EntityStateBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { ConfirmToggleButton } from "./confirm-toggle";
import type { Dictionary, ExchangeCurrencyMapping } from "./settings-surface";
import { SettingsSectionNotice, type SectionNotice } from "./settings-section-notice";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_RE = /^[A-Z]{3}$/;

export function ExchangeCurrenciesSection({
  dictionary,
  mappings,
  notice,
}: Readonly<{ dictionary: Dictionary; mappings: ExchangeCurrencyMapping[]; notice: SectionNotice }>) {
  const [mode, setMode] = useState<"closed" | "register" | "replace">("closed");
  const [editing, setEditing] = useState<ExchangeCurrencyMapping | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const codeId = useId();
  const labelId = useId();
  const currencyUuidId = useId();
  const exchangeUuidId = useId();

  function validate(form: HTMLFormElement) {
    const data = new FormData(form);
    const code = String(data.get("code") ?? "").trim().toUpperCase();
    const currencyUuid = String(data.get("currencyUuid") ?? "").trim();
    const exchangeCurrencyUuid = String(data.get("exchangeCurrencyUuid") ?? "").trim();
    const intent = String(data.get("intent") ?? "register");
    if (!CODE_RE.test(code)) {
      setFormError(dictionary.adminCodeInvalid);
      return false;
    }
    if (!UUID_RE.test(currencyUuid) || !UUID_RE.test(exchangeCurrencyUuid)) {
      setFormError(dictionary.adminUuidInvalid);
      return false;
    }
    if (intent === "register" && mappings.some((mapping) => mapping.code === code)) {
      setFormError(dictionary.adminDuplicateCode);
      return false;
    }
    setFormError(null);
    return true;
  }

  function openRegister() {
    setEditing(null);
    setFormError(null);
    setMode("register");
  }

  function openReplace(mapping: ExchangeCurrencyMapping) {
    setEditing(mapping);
    setFormError(null);
    setMode("replace");
  }

  function openReplaceOrReactivate() {
    setEditing(null);
    setFormError(null);
    setMode("replace");
  }

  function closeForm() {
    setEditing(null);
    setFormError(null);
    setMode("closed");
  }

  return (
    <div className="space-y-4">
      <SettingsSectionNotice
        dictionary={dictionary}
        notice={notice}
        toastEntries={[
          { param: "success", value: "exchange-currency", kind: "success", message: dictionary.adminExchangeCurrencySaved },
          { param: "error", value: "exchange-currency-failed", kind: "error", message: dictionary.adminExchangeCurrencyFailed },
        ]}
      />
      {mappings.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{dictionary.adminEmptyCurrencies}</p>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dictionary.adminColCode}</TableHead>
              <TableHead>{dictionary.adminCatalogLabelLabel}</TableHead>
              <TableHead>{dictionary.adminColStatus}</TableHead>
              <TableHead className="text-right">{dictionary.adminColActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping) => (
              <TableRow key={mapping.code}>
                <TableCell className="font-mono font-medium">{mapping.code}</TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">{mapping.label}</span>
                </TableCell>
                <TableCell>
                  <EntityStateBadge
                    labels={{ active: dictionary.adminStatusActive, archived: dictionary.adminStatusInactive, inactive: dictionary.adminStatusInactive }}
                    state="active"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => openReplace(mapping)}>
                      {dictionary.adminExchangeCurrencyReplace}
                    </Button>
                    <form action="/admin/exchange-currencies" method="post" className="inline">
                      <input name="code" type="hidden" value={mapping.code} />
                      <input name="intent" type="hidden" value="deactivate" />
                      <ConfirmToggleButton
                        confirmBody={dictionary.adminConfirmDeactivateBody}
                        confirmTitle={dictionary.adminConfirmDeactivateTitle}
                        dictionary={dictionary}
                        kind="destructive"
                        label={dictionary.adminDeactivate}
                      />
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      {mode !== "closed" ? (
        <form
          action="/admin/exchange-currencies"
          method="post"
          className="rounded-lg border bg-muted/50 p-4"
          onSubmit={(event) => {
            if (!validate(event.currentTarget)) event.preventDefault();
          }}
        >
          {formError ? <p className="mb-3 text-sm font-medium text-destructive">{formError}</p> : null}
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={codeId}>{dictionary.adminCurrencyCode}</FieldLabel>
              <Input
                id={codeId}
                maxLength={3}
                name="code"
                readOnly={mode === "replace" && editing !== null}
                required
                defaultValue={editing?.code ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={labelId}>{dictionary.adminCatalogLabelLabel}</FieldLabel>
              <Input id={labelId} name="label" required defaultValue={editing?.label ?? ""} />
            </Field>
            <Field>
              <FieldLabel htmlFor={currencyUuidId}>{dictionary.adminCatalogCurrencyUuidLabel}</FieldLabel>
              <Input id={currencyUuidId} name="currencyUuid" required />
              <FieldDescription>{dictionary.adminCatalogUuidHelp}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor={exchangeUuidId}>{dictionary.adminCatalogExchangeCurrencyUuidLabel}</FieldLabel>
              <Input id={exchangeUuidId} name="exchangeCurrencyUuid" required />
            </Field>
          </FieldGroup>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeForm}>
              {dictionary.cancel}
            </Button>
            <input name="intent" type="hidden" value={mode} />
            <AdminSubmit
              label={
                mode === "replace"
                  ? editing
                    ? dictionary.adminExchangeCurrencyReplace
                    : dictionary.adminExchangeCurrencyReplaceOrReactivate
                  : dictionary.adminAdd
              }
            />
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={openRegister}>
            {dictionary.adminAdd}
          </Button>
          <Button type="button" variant="outline" onClick={openReplaceOrReactivate}>
            {dictionary.adminExchangeCurrencyReplaceOrReactivate}
          </Button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useId, useState } from "react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { Button } from "@/components/ui/button";
import { CopyField, type CopyFieldLabels } from "@/components/ui/copy-field";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SupportedLocale } from "@/i18n/locales";

import { ConfirmToggleButton } from "./confirm-toggle";
import type { Dictionary } from "./settings-surface";

type CatalogItem = Readonly<{
  id: string;
  label: string;
  active: boolean;
  createdAt: string;
  detailLabel: string;
  detailValue: string;
  secondaryLabel?: string;
  secondaryValue?: string;
}>;

export function CatalogRecordsSection({
  dictionary,
  formAction,
  items,
  kind,
  locale,
}: Readonly<{ dictionary: Dictionary; formAction: string; items: CatalogItem[]; kind: "pair" | "method"; locale: SupportedLocale }>) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const addLabelId = useId();
  const addDetailId = useId();
  const addSecondaryId = useId();

  const copyLabels: CopyFieldLabels = {
    copy: dictionary.copyFieldCopy ?? "Copy",
    copied: dictionary.copyFieldCopied ?? "Copied",
    pending: dictionary.copyFieldPending ?? "Copying",
    failed: dictionary.copyFieldFailed ?? "Copy failed",
  };

  function validateName(name: string) {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 128) return false;
    return !items.some((item) => item.id !== editingId && item.label.toLowerCase() === trimmed.toLowerCase());
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{dictionary.adminEmptyRecords}</p>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dictionary.adminColName}</TableHead>
              <TableHead>{dictionary.adminColCreated}</TableHead>
              <TableHead>{dictionary.adminColStatus}</TableHead>
              <TableHead className="text-right">{dictionary.adminColActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  {editingId === item.id ? (
                    <form action={`${formAction}/${item.id}`} method="post" className="flex items-center gap-2">
                      <Input
                        aria-label={dictionary.adminRename}
                        className="max-w-xs"
                        defaultValue={item.label}
                        name="label"
                        required
                      />
                      <AdminSubmit label={dictionary.save} tone="secondary" />
                      <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                        {dictionary.cancel}
                      </Button>
                    </form>
                  ) : (
                    <div className="space-y-1">
                      {kind === "pair" ? (
                        <span className="inline-flex rounded-pill bg-accent-soft px-2.5 py-0.5 font-money text-xs font-medium text-accent-on-soft">
                          {item.label}
                        </span>
                      ) : (
                        <span className="font-medium">{item.label}</span>
                      )}
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                        <CopyField className="max-w-40" labels={copyLabels} value={item.detailValue} />
                        {item.secondaryValue ? (
                          <CopyField className="max-w-40" labels={copyLabels} value={item.secondaryValue} />
                        ) : null}
                      </div>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString(locale)}
                </TableCell>
                <TableCell>
                  {item.active ? (
                    <StatusBadge label={dictionary.adminStatusActive} tone="success" />
                  ) : (
                    <StatusBadge label={dictionary.adminStatusInactive} tone="neutral" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editingId !== item.id ? (
                    <span className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => setEditingId(item.id)}>
                        {dictionary.adminRename}
                      </Button>
                      <form action={`${formAction}/${item.id}`} method="post" className="inline">
                        <input name="intent" type="hidden" value={item.active ? "toggle-inactive" : "toggle-active"} />
                        <ConfirmToggleButton
                          confirmBody={item.active ? dictionary.adminConfirmDeactivateBody : undefined}
                          confirmTitle={item.active ? dictionary.adminConfirmDeactivateTitle : dictionary.adminConfirmDeactivateTitle}
                          dictionary={dictionary}
                          kind={item.active ? "destructive" : "default"}
                          label={item.active ? dictionary.adminDeactivate : dictionary.adminActivate}
                        />
                      </form>
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      {adding ? (
        <form
          action={formAction}
          method="post"
          className="rounded-lg border bg-muted/50 p-4"
          onSubmit={(event) => {
            const data = new FormData(event.currentTarget);
            const label = String(data.get("label") ?? "").trim();
            if (!validateName(label)) {
              event.preventDefault();
              setFormError(dictionary.adminRenameConflict);
            } else {
              setFormError(null);
            }
          }}
        >
          {formError ? <p className="mb-3 text-sm font-medium text-destructive">{formError}</p> : null}
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={addLabelId}>{kind === "pair" ? dictionary.adminPairName : dictionary.adminMethodName}</FieldLabel>
              <Input id={addLabelId} name="label" required />
            </Field>
            <Field>
              <FieldLabel htmlFor={addDetailId}>{kind === "pair" ? dictionary.adminCatalogCurrencyUuidLabel : dictionary.adminCatalogPaymentMethodUuidLabel}</FieldLabel>
              <Input id={addDetailId} name={kind === "pair" ? "currencyUuid" : "paymentMethodUuid"} required />
              <FieldDescription>{dictionary.adminCatalogUuidHelp}</FieldDescription>
            </Field>
            {kind === "pair" ? (
              <Field>
                <FieldLabel htmlFor={addSecondaryId}>{dictionary.adminCatalogExchangeCurrencyUuidLabel}</FieldLabel>
                <Input id={addSecondaryId} name="exchangeCurrencyUuid" required />
              </Field>
            ) : null}
          </FieldGroup>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => { setAdding(false); setFormError(null); }}>
              {dictionary.cancel}
            </Button>
            <AdminSubmit label={dictionary.adminAdd} />
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
          {kind === "pair" ? dictionary.adminNewPair : dictionary.adminNewMethod}
        </Button>
      )}
    </div>
  );
}

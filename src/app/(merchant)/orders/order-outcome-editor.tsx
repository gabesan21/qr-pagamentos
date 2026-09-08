"use client";

import { useState } from "react";

import { FormDraftGuard } from "@/app/form-draft";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/modal";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { getDictionary } from "@/i18n/dictionaries";
import type { OrderV2LocalOutcome } from "@/orders/order-v2";

type Dictionary = ReturnType<typeof getDictionary>;

const ORDER_V2_NOTICE_KEY = "orders-v2";
const ORDER_V2_FAILURE_NOTICES = ["failed"] as const;

// One select + note + confirmation replaces the delivered pair of `<details>`
// forms (14.5.1 F03): the local outcome is never gated on `confirmed` and
// never invents a state — it stays the order's whole append-only operator
// lifecycle, so both outcomes remain reachable from the same control.
export function OrderOutcomeEditor({
  dictionary,
  orderId,
  version,
}: Readonly<{
  dictionary: Dictionary;
  orderId: string;
  version: number;
}>) {
  const [outcome, setOutcome] = useState<OrderV2LocalOutcome>("LOCAL_FINALIZED");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const finalize = outcome === "LOCAL_FINALIZED";
  const formId = `outcome-form-${orderId}`;
  const draftKey = `order-v2-outcome-${orderId}`;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{dictionary.orderV2OutcomePrecedenceCaption}</p>
      <FormDraftGuard
        draftKey={draftKey}
        fieldNames={["outcome", "note"]}
        formId={formId}
        noticeKey={ORDER_V2_NOTICE_KEY}
        noticeValues={ORDER_V2_FAILURE_NOTICES}
      />
      <form action={`/orders-v2/${orderId}`} className="flex flex-col gap-3" id={formId} method="post">
        <Input name="action" type="hidden" value="set-outcome" />
        <Input name="version" type="hidden" value={version} />
        <Field>
          <FieldLabel htmlFor={`${formId}-outcome`}>{dictionary.orderV2OutcomeSelectLabel}</FieldLabel>
          <NativeSelect
            id={`${formId}-outcome`}
            name="outcome"
            onChange={(event) => setOutcome(event.target.value as OrderV2LocalOutcome)}
            value={outcome}
          >
            <NativeSelectOption value="LOCAL_FINALIZED">{dictionary.orderV2OutcomeFinalize}</NativeSelectOption>
            <NativeSelectOption value="LOCAL_CANCELLED">{dictionary.orderV2OutcomeCancel}</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-note`}>{dictionary.orderV2OutcomeNoteLabel}</FieldLabel>
          <Textarea data-ds-hit-target id={`${formId}-note`} maxLength={2000} name="note" />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button
            data-ds-hit-target
            onClick={() => setConfirmOpen(true)}
            type="button"
            variant={finalize ? "outline" : "destructive"}
          >
            {finalize ? dictionary.orderV2OutcomeFinalize : dictionary.orderV2OutcomeCancel}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        cancelLabel={dictionary.cancel}
        confirmLabel={finalize ? dictionary.orderV2OutcomeFinalize : dictionary.orderV2OutcomeCancel}
        description={finalize ? dictionary.orderV2OutcomeFinalizeDescription : dictionary.orderV2OutcomeCancelDescription}
        destructive={!finalize}
        failureMessage={dictionary.orderV2OutcomeFailed}
        onConfirm={() => {
          const form = document.getElementById(formId);
          if (form instanceof HTMLFormElement) form.requestSubmit();
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pendingLabel={dictionary.loading}
        title={finalize ? dictionary.orderV2OutcomeFinalizeConfirm : dictionary.orderV2OutcomeCancelConfirm}
      />
    </div>
  );
}

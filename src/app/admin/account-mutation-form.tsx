"use client";

import { useRef, useState } from "react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type MutationFormProps = Readonly<{
  action: string;
  cancelLabel: string;
  confirmDescription: string;
  confirmLabel: string;
  confirmTitle: string;
  currentValue: string;
  destructiveValue: string;
  fieldLabel: string;
  name: "role" | "status";
  options: readonly Readonly<{ label: string; value: string }>[];
  saveLabel: string;
}>;

export function AccountMutationForm(props: MutationFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(props.currentValue);
  const needsConfirmation = selectedValue === props.destructiveValue && selectedValue !== props.currentValue;

  function prepareSubmission() {
    if (needsConfirmation) {
      setConfirmationOpen(true);
      return;
    }
    formRef.current?.requestSubmit();
  }

  return (
    <form action={props.action} method="post" ref={formRef}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${props.name}-${props.action}`}>{props.fieldLabel}</FieldLabel>
          <NativeSelect
            id={`${props.name}-${props.action}`}
            name={props.name}
            onChange={(event) => {
              setSelectedValue(event.currentTarget.value);
              setConfirmationOpen(false);
            }}
            value={selectedValue}
          >
            {props.options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        {confirmationOpen ? (
          <Alert variant="warning">
            <AlertTitle>{props.confirmTitle}</AlertTitle>
            <AlertDescription>{props.confirmDescription}</AlertDescription>
            <div className="admin-confirm-actions">
              <Button onClick={() => setConfirmationOpen(false)} type="button" variant="outline">{props.cancelLabel}</Button>
              <AdminSubmit label={props.confirmLabel} tone="secondary" />
            </div>
          </Alert>
        ) : (
          <Button onClick={prepareSubmission} type="button" variant="outline">{props.saveLabel}</Button>
        )}
      </FieldGroup>
    </form>
  );
}

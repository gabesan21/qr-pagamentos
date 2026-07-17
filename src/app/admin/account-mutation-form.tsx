"use client";

import { useEffect, useReducer, useRef } from "react";

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

export type AccountMutationState = Readonly<{
  confirmationOpen: boolean;
  selectedValue: string;
}>;

type AccountMutationAction =
  | Readonly<{ type: "cancel" | "open-confirmation" }>
  | Readonly<{ type: "select"; value: string }>;

export function reduceAccountMutation(state: AccountMutationState, action: AccountMutationAction): AccountMutationState {
  if (action.type === "select") return { confirmationOpen: false, selectedValue: action.value };
  if (action.type === "open-confirmation") return { ...state, confirmationOpen: true };
  return { ...state, confirmationOpen: false };
}

export function accountMutationIntent(state: AccountMutationState, currentValue: string, destructiveValue: string) {
  return state.selectedValue === destructiveValue && state.selectedValue !== currentValue ? "confirm" : "submit";
}

export function synchronizeAccountMutationFocus(
  confirmationOpen: boolean,
  restoreTrigger: boolean,
  cancelControl: Pick<HTMLButtonElement, "focus"> | null,
  triggerControl: Pick<HTMLButtonElement, "focus"> | null,
) {
  if (confirmationOpen) cancelControl?.focus();
  else if (restoreTrigger) triggerControl?.focus();
}

export function AccountMutationForm(props: MutationFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerRef = useRef(false);
  const [state, dispatch] = useReducer(reduceAccountMutation, {
    confirmationOpen: false,
    selectedValue: props.currentValue,
  });

  useEffect(() => {
    synchronizeAccountMutationFocus(state.confirmationOpen, restoreTriggerRef.current, cancelRef.current, triggerRef.current);
    restoreTriggerRef.current = false;
  }, [state.confirmationOpen]);

  function prepareSubmission() {
    if (accountMutationIntent(state, props.currentValue, props.destructiveValue) === "confirm") {
      dispatch({ type: "open-confirmation" });
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
              restoreTriggerRef.current = false;
              dispatch({ type: "select", value: event.currentTarget.value });
            }}
            value={state.selectedValue}
          >
            {props.options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
          </NativeSelect>
        </Field>
        {state.confirmationOpen ? (
          <Alert variant="warning">
            <AlertTitle>{props.confirmTitle}</AlertTitle>
            <AlertDescription>{props.confirmDescription}</AlertDescription>
            <div className="admin-confirm-actions">
              <Button ref={cancelRef} onClick={() => {
                restoreTriggerRef.current = true;
                dispatch({ type: "cancel" });
              }} type="button" variant="outline">{props.cancelLabel}</Button>
              <AdminSubmit label={props.confirmLabel} tone="secondary" />
            </div>
          </Alert>
        ) : (
          <Button ref={triggerRef} onClick={prepareSubmission} type="button" variant="outline">{props.saveLabel}</Button>
        )}
      </FieldGroup>
    </form>
  );
}

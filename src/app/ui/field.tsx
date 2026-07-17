import type { InputHTMLAttributes } from "react";

import { Field as FieldRoot, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { error?: string; helpText?: string; label: string };

/** @deprecated Migrate consumers to FieldGroup/Field/Input in tasks 1.4.3/1.4.4. */
export function Field({ error, helpText, id, label, disabled, ...props }: Readonly<FieldProps>) {
  const descriptionId = error || helpText ? `${id}-description` : undefined;
  return <FieldRoot data-disabled={disabled || undefined} data-invalid={Boolean(error) || undefined}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input aria-describedby={descriptionId} aria-invalid={Boolean(error) || undefined} disabled={disabled} id={id} {...props} />
    {error ? <FieldError id={descriptionId}>{error}</FieldError> : null}
    {!error && helpText ? <FieldDescription id={descriptionId}>{helpText}</FieldDescription> : null}
  </FieldRoot>;
}

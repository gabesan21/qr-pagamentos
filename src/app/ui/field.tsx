import type { InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  helpText?: string;
  label: string;
};

export function Field({ error, helpText, id, label, ...props }: Readonly<FieldProps>) {
  const descriptionId = error || helpText ? `${id}-description` : undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <input aria-describedby={descriptionId} aria-invalid={Boolean(error)} className="field__input" id={id} {...props} />
      {error ? <p className="field__message" id={descriptionId} role="alert">{error}</p> : null}
      {!error && helpText ? <p className="field__help" id={descriptionId}>{helpText}</p> : null}
    </div>
  );
}

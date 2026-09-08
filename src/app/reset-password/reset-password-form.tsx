"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { BrandIdentity } from "@/brand/brand-identity";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { ResetPasswordSubmit } from "./reset-password-submit";

type ResetPasswordFormDictionary = Readonly<{
  hidePassword: string;
  resetPasswordConfirmPasswordLabel: string;
  resetPasswordFailed: string;
  resetPasswordHeading: string;
  resetPasswordIntroduction: string;
  resetPasswordLengthMeter: string;
  resetPasswordMismatch: string;
  resetPasswordNewPasswordLabel: string;
  resetPasswordRequirement: string;
  resetPasswordSubmit: string;
  resetPasswordSubmitting: string;
  showPassword: string;
}>;

type ResetPasswordFormProps = Readonly<{
  dictionary: ResetPasswordFormDictionary;
  hasError: boolean;
  token: string;
}>;

/**
 * The credential form panel for `/reset-password`, rendered inside the
 * shared `AuthCard` once the token has been validated server-side. Password
 * mismatch is client-side only, mirroring `validatePassword`'s 12-128
 * bound; the server keeps folding every rejection into the opaque
 * `error=failed` redirect handled by the caller.
 */
export function ResetPasswordForm({ dictionary, hasError, token }: ResetPasswordFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const requirementId = useId();
  const meterId = useId();

  const length = newPassword.length;
  const sufficient = length >= 12;
  const progress = Math.min(100, (length / 12) * 100);

  function evaluateMismatch(password: string, confirmationValue: string) {
    setMismatch(confirmationValue.length > 0 && confirmationValue !== password);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (newPassword !== confirmation) {
      event.preventDefault();
      setMismatch(true);
    }
  }

  return (
    <form action="/reset-password/submit" className="reset-password-form" id="reset-password-form" method="post" noValidate onSubmit={handleSubmit}>
      <CardHeader>
        <BrandIdentity className="auth-brand" variant="product-lockup" />
        <CardTitle>{dictionary.resetPasswordHeading}</CardTitle>
        <CardDescription>{dictionary.resetPasswordIntroduction}</CardDescription>
      </CardHeader>
      <CardContent>
        {hasError && (
          <Alert role="alert" variant="destructive">
            <AlertDescription>{dictionary.resetPasswordFailed}</AlertDescription>
          </Alert>
        )}
        <input name="token" type="hidden" value={token} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="newPassword">{dictionary.resetPasswordNewPasswordLabel}</FieldLabel>
            <div className="auth-password-field">
              <Input
                aria-describedby={`${requirementId} ${meterId}`}
                autoComplete="new-password"
                className="auth-password-field__input"
                id="newPassword"
                maxLength={128}
                minLength={12}
                name="newPassword"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setNewPassword(value);
                  evaluateMismatch(value, confirmation);
                }}
                required
                type={showPassword ? "text" : "password"}
                value={newPassword}
              />
              <button
                aria-label={showPassword ? dictionary.hidePassword : dictionary.showPassword}
                className="auth-password-field__toggle"
                onClick={() => setShowPassword((value) => !value)}
                type="button"
              >
                {showPassword ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
              </button>
            </div>
            <FieldDescription id={requirementId}>{dictionary.resetPasswordRequirement}</FieldDescription>
            <div aria-hidden="true" className="flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${sufficient ? "bg-primary" : "bg-warning"} ${
                    progress === 0
                      ? "w-0"
                      : progress <= 25
                        ? "w-1/4"
                        : progress <= 50
                          ? "w-1/2"
                          : progress <= 75
                            ? "w-3/4"
                            : "w-full"
                  }`}
                />
              </div>
              <span className={`text-xs ${sufficient ? "text-primary" : "text-muted-foreground"}`} id={meterId}>
                {dictionary.resetPasswordLengthMeter.replace("{{len}}", String(length))}
              </span>
            </div>
          </Field>
          <Field data-invalid={mismatch || undefined}>
            <FieldLabel htmlFor="confirmation">{dictionary.resetPasswordConfirmPasswordLabel}</FieldLabel>
            <Input
              aria-invalid={mismatch || undefined}
              autoComplete="new-password"
              id="confirmation"
              maxLength={128}
              minLength={12}
              name="confirmation"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setConfirmation(value);
                evaluateMismatch(newPassword, value);
              }}
              required
              type={showPassword ? "text" : "password"}
              value={confirmation}
            />
            {mismatch && <FieldError>{dictionary.resetPasswordMismatch}</FieldError>}
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter>
        <ResetPasswordSubmit label={dictionary.resetPasswordSubmit} pendingLabel={dictionary.resetPasswordSubmitting} />
      </CardFooter>
    </form>
  );
}

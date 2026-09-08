"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";

const TOTP_CODE_LENGTH = 6;
const RECOVERY_CODE_LENGTH = 64;
const RECOVERY_CODE_PATTERN = "[0-9a-f]{64}";

type TotpChallengeFormProps = {
  dictionary: {
    backToCredentials: string;
    mfaHeading: string;
    mfaIntroduction: string;
    mfaCodeLabel: string;
    mfaRecoveryCodeLabel: string;
    mfaRecoveryLink: string;
    mfaTotpLink: string;
    mfaSubmit: string;
    mfaSubmitting: string;
    mfaFailed: string;
  };
  failed: boolean;
};

export function TotpChallengeForm({ dictionary, failed }: Readonly<TotpChallengeFormProps>) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const { pending } = useFormStatus();
  const formRef = useRef<HTMLFormElement>(null);
  const recoveryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (useRecovery) recoveryRef.current?.focus();
  }, [useRecovery]);

  function toggleMode() {
    setUseRecovery((previous) => !previous);
    setCode("");
  }

  return (
    <form action="/login/totp-challenge" className="login-form" id="totp-challenge-form" method="post" ref={formRef}>
      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{dictionary.mfaFailed}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        {useRecovery ? (
          <Field>
            <FieldLabel htmlFor="mfa-recovery-code">{dictionary.mfaRecoveryCodeLabel}</FieldLabel>
            <Input
              autoComplete="one-time-code"
              disabled={pending}
              id="mfa-recovery-code"
              inputMode="text"
              maxLength={RECOVERY_CODE_LENGTH}
              name="code"
              pattern={RECOVERY_CODE_PATTERN}
              ref={recoveryRef}
              required
              type="text"
            />
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="mfa-totp-code">{dictionary.mfaCodeLabel}</FieldLabel>
            {/* Native paste fill and submit-on-completion come from the
                owned InputOTP primitive; `name="code"` keeps the field
                postable through the unchanged native form/route pair. */}
            <InputOTP
              aria-label={dictionary.mfaCodeLabel}
              autoFocus
              disabled={pending}
              id="mfa-totp-code"
              inputMode="numeric"
              maxLength={TOTP_CODE_LENGTH}
              name="code"
              onChange={setCode}
              onComplete={() => formRef.current?.requestSubmit()}
              required
              value={code}
            >
              <InputOTPGroup>
                {Array.from({ length: TOTP_CODE_LENGTH }, (_, index) => (
                  <InputOTPSlot index={index} key={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </Field>
        )}
      </FieldGroup>
      <div className="auth-totp-actions">
        <Button asChild disabled={pending} variant="ghost">
          <a href="/login">{dictionary.backToCredentials}</a>
        </Button>
        <Button aria-busy={pending || undefined} className="w-full" disabled={pending} type="submit">
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? dictionary.mfaSubmitting : dictionary.mfaSubmit}
        </Button>
      </div>
      <button className="auth-mode-toggle" disabled={pending} onClick={toggleMode} type="button">
        {useRecovery ? dictionary.mfaTotpLink : dictionary.mfaRecoveryLink}
      </button>
    </form>
  );
}

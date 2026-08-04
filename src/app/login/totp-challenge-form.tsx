"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type TotpChallengeFormProps = {
  dictionary: {
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
  const { pending } = useFormStatus();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [useRecovery]);

  const toggleMode = () => setUseRecovery((previous) => !previous);

  return (
    <form action="/login/totp-challenge" className="login-form" id="totp-challenge-form" method="post">
      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{dictionary.mfaFailed}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="mfa-code">{useRecovery ? dictionary.mfaRecoveryCodeLabel : dictionary.mfaCodeLabel}</FieldLabel>
          <Input
            autoComplete="one-time-code"
            autoFocus
            id="mfa-code"
            inputMode={useRecovery ? "text" : "numeric"}
            maxLength={useRecovery ? 64 : 6}
            name="code"
            pattern={useRecovery ? "[0-9a-f]{64}" : "[0-9]{6}"}
            ref={inputRef}
            required
            type="text"
          />
        </Field>
      </FieldGroup>
      <div className="flex items-center justify-between gap-4">
        <Button
          disabled={pending}
          onClick={toggleMode}
          type="button"
          variant="link"
        >
          {useRecovery ? dictionary.mfaTotpLink : dictionary.mfaRecoveryLink}
        </Button>
        <Button aria-busy={pending || undefined} disabled={pending} type="submit">
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? dictionary.mfaSubmitting : dictionary.mfaSubmit}
        </Button>
      </div>
    </form>
  );
}

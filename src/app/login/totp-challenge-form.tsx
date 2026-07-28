"use client";

import { useEffect, useState } from "react";

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
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const form = document.getElementById("totp-challenge-form");
    if (!(form instanceof HTMLFormElement)) return;
    const observeNativeSubmit = () => setPending(true);
    form.addEventListener("submit", observeNativeSubmit);
    return () => form.removeEventListener("submit", observeNativeSubmit);
  }, []);

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
          <FieldLabel htmlFor="mfa-code">{useRecovery ? dictionary.mfaCodeLabel : dictionary.mfaCodeLabel}</FieldLabel>
          <Input
            autoComplete="one-time-code"
            autoFocus
            id="mfa-code"
            inputMode="numeric"
            maxLength={useRecovery ? 64 : 6}
            name="code"
            pattern={useRecovery ? "[0-9a-f]*" : "[0-9]*"}
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
        <Button aria-busy={pending || undefined} disabled={pending} form="totp-challenge-form" type="submit">
          {pending && <Spinner data-icon="inline-start" />}
          {pending ? dictionary.mfaSubmitting : dictionary.mfaSubmit}
        </Button>
      </div>
    </form>
  );
}

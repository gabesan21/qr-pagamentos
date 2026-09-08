"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type PasswordFieldsProps = Readonly<{
  dictionary: {
    profileCurrentPasswordLabel: string;
    profileNewPasswordLabel: string;
    profileConfirmPasswordLabel: string;
    profilePasswordShow: string;
    profilePasswordHide: string;
    profilePasswordLengthMeter: string;
    profilePasswordRequirement: string;
    profileCurrentPasswordRequiredError: string;
    profilePasswordTooShortError: string;
    profilePasswordTooLongError: string;
    profilePasswordMismatchError: string;
  };
}>;

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;

// One class per character up to MIN_LENGTH, written out literally so the
// Tailwind build can pick them up statically (arbitrary values are never
// resolved from a computed string) — the same technique already used for
// the dashboard progress bars.
const METER_WIDTHS = [
  "w-[0%]",
  "w-[8%]",
  "w-[17%]",
  "w-[25%]",
  "w-[33%]",
  "w-[42%]",
  "w-[50%]",
  "w-[58%]",
  "w-[67%]",
  "w-[75%]",
  "w-[83%]",
  "w-[92%]",
  "w-[100%]",
] as const;

export function PasswordFields({ dictionary }: PasswordFieldsProps) {
  const [showCurrent, setShowCurrent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const currentRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const currentHintId = useId();
  const requirementId = useId();
  const meterId = useId();
  const length = newPassword.length;
  const sufficient = length >= MIN_LENGTH;
  const meterWidth = METER_WIDTHS[Math.min(length, MIN_LENGTH)];

  useEffect(() => {
    const currentInput = currentRef.current;
    const form = currentInput?.closest("form");
    if (!currentInput || !form) return;

    const handleSubmit = (event: Event) => {
      let invalid = false;
      if (!currentInput.value) {
        setCurrentError(dictionary.profileCurrentPasswordRequiredError);
        invalid = true;
      } else {
        setCurrentError(null);
      }
      if (newPassword.length < MIN_LENGTH) {
        setNewError(dictionary.profilePasswordTooShortError);
        invalid = true;
      } else if (newPassword.length > MAX_LENGTH) {
        setNewError(dictionary.profilePasswordTooLongError);
        invalid = true;
      } else {
        setNewError(null);
      }
      const confirmation = confirmRef.current?.value ?? "";
      if (newPassword !== confirmation) {
        setConfirmError(dictionary.profilePasswordMismatchError);
        invalid = true;
      } else {
        setConfirmError(null);
      }
      if (invalid) event.preventDefault();
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [dictionary.profileCurrentPasswordRequiredError, dictionary.profilePasswordMismatchError, dictionary.profilePasswordTooLongError, dictionary.profilePasswordTooShortError, newPassword]);

  return (
    <FieldGroup>
      <Field data-invalid={currentError ? true : undefined}>
        <FieldLabel htmlFor="profile-current-password">{dictionary.profileCurrentPasswordLabel}</FieldLabel>
        <div className="relative">
          <Input
            aria-describedby={currentHintId}
            autoComplete="current-password"
            id="profile-current-password"
            name="currentPassword"
            onChange={() => setCurrentError((previous) => (previous ? null : previous))}
            ref={currentRef}
            type={showCurrent ? "text" : "password"}
          />
          <Button
            aria-controls="profile-current-password"
            aria-expanded={showCurrent}
            aria-label={showCurrent ? dictionary.profilePasswordHide : dictionary.profilePasswordShow}
            className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-md"
            onClick={() => setShowCurrent((value) => !value)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {showCurrent ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </Button>
        </div>
        <FieldDescription id={currentHintId}>{dictionary.profilePasswordRequirement}</FieldDescription>
        {currentError ? <FieldError>{currentError}</FieldError> : null}
      </Field>
      <Field data-invalid={newError ? true : undefined}>
        <FieldLabel htmlFor="profile-new-password">{dictionary.profileNewPasswordLabel}</FieldLabel>
        <Input
          aria-describedby={`${requirementId} ${meterId}`}
          autoComplete="new-password"
          id="profile-new-password"
          maxLength={MAX_LENGTH}
          name="newPassword"
          onChange={(event) => setNewPassword(event.currentTarget.value)}
          type="password"
          value={newPassword}
        />
        <FieldDescription id={requirementId}>{dictionary.profilePasswordRequirement}</FieldDescription>
        <div aria-hidden className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={`h-full transition-all ${sufficient ? "bg-primary" : "bg-warning"} ${meterWidth}`} />
          </div>
          <span className={`text-xs ${sufficient ? "text-primary" : "text-muted-foreground"}`} id={meterId}>
            {dictionary.profilePasswordLengthMeter.replace("{{len}}", String(length))}
          </span>
        </div>
        {newError ? <FieldError>{newError}</FieldError> : null}
      </Field>
      <Field data-invalid={confirmError ? true : undefined}>
        <FieldLabel htmlFor="profile-confirm-password">{dictionary.profileConfirmPasswordLabel}</FieldLabel>
        <Input
          autoComplete="new-password"
          id="profile-confirm-password"
          maxLength={MAX_LENGTH}
          name="confirmation"
          onChange={() => setConfirmError((previous) => (previous ? null : previous))}
          ref={confirmRef}
          type="password"
        />
        {confirmError ? <FieldError>{confirmError}</FieldError> : null}
      </Field>
    </FieldGroup>
  );
}

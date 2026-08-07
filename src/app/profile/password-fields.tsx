"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
  };
}>;

export function PasswordFields({ dictionary }: PasswordFieldsProps) {
  const [showCurrent, setShowCurrent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const currentHintId = useId();
  const requirementId = useId();
  const meterId = useId();
  const length = newPassword.length;
  const sufficient = length >= 12;
  const progress = Math.min(100, (length / 12) * 100);

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="profile-current-password">{dictionary.profileCurrentPasswordLabel}</FieldLabel>
        <div className="relative">
          <Input
            aria-describedby={currentHintId}
            autoComplete="current-password"
            id="profile-current-password"
            name="currentPassword"
            required
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
      </Field>
      <Field>
        <FieldLabel htmlFor="profile-new-password">{dictionary.profileNewPasswordLabel}</FieldLabel>
        <Input
          aria-describedby={`${requirementId} ${meterId}`}
          autoComplete="new-password"
          id="profile-new-password"
          minLength={12}
          name="newPassword"
          onChange={(event) => setNewPassword(event.currentTarget.value)}
          required
          type="password"
          value={newPassword}
        />
        <FieldDescription id={requirementId}>{dictionary.profilePasswordRequirement}</FieldDescription>
        <div aria-hidden className="flex items-center gap-3">
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
            {dictionary.profilePasswordLengthMeter.replace("{{len}}", String(length))}
          </span>
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor="profile-confirm-password">{dictionary.profileConfirmPasswordLabel}</FieldLabel>
        <Input
          autoComplete="new-password"
          id="profile-confirm-password"
          minLength={12}
          name="confirmation"
          required
          type="password"
        />
      </Field>
    </FieldGroup>
  );
}

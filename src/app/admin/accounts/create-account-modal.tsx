"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useId, useState } from "react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { SegmentedControl } from "@/app/admin/admin-controls";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;
type Role = "USER" | "ADMIN";
type Strength = "weak" | "medium" | "strong";

const GENERATED_PASSWORD_LENGTH = 18;
const PASSWORD_CHARSET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// `crypto.getRandomValues` fills the whole typed array (or throws) — it never
// leaves an entry `undefined` — so there is no reachable fallback branch once
// the guard above confirms the API exists.
function generatePassword() {
  const randomValues = new Uint32Array(GENERATED_PASSWORD_LENGTH);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(randomValues);
  let password = "";
  for (let index = 0; index < GENERATED_PASSWORD_LENGTH; index += 1) {
    password += PASSWORD_CHARSET[randomValues[index] % PASSWORD_CHARSET.length];
  }
  return password;
}

function passwordStrength(password: string): Strength {
  if (password.length >= 16 && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password)) return "strong";
  if (password.length >= 12) return "medium";
  return "weak";
}

// Width is a Tailwind fraction utility, never an inline style, so the meter
// stays a token-driven class the design-token lint can see.
const STRENGTH_METER_CLASS: Readonly<Record<Strength, string>> = {
  weak: "w-1/4 bg-destructive",
  medium: "w-3/5 bg-warning",
  strong: "w-full bg-success",
};

type FormErrors = Readonly<{ username?: string; email?: string; password?: string }>;

// Create is a Modal opened from the page header (no always-visible inline
// card): the field set, action and method stay byte-identical to the
// delivered `POST /admin/users` route — generator, strength meter and the
// compact `CopyField` are client-side affordances over that same field, and
// role is the admin-local `SegmentedControl`. There is no initial-status
// control: `POST /admin/users` writes `ACTIVE` unconditionally and accepts no
// status field (recorded gap, not a service change here).
export function CreateAccountModal({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [errors, setErrors] = useState<FormErrors>({});
  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const passwordHelpId = useId();

  const strength = passwordStrength(password);
  const strengthLabel = strength === "strong"
    ? dictionary.adminUsersDirectoryPasswordStrengthStrong
    : strength === "medium"
      ? dictionary.adminUsersDirectoryPasswordStrengthMedium
      : dictionary.adminUsersDirectoryPasswordStrengthWeak;

  function resetForm() {
    setUsername("");
    setEmail("");
    setPassword("");
    setRole("USER");
    setErrors({});
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    setOpen(nextOpen);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const nextErrors: { username?: string; email?: string; password?: string } = {};
    if (!username.trim()) nextErrors.username = dictionary.adminUsersDirectoryUsernameRequired;
    if (email.trim() && !EMAIL_PATTERN.test(email.trim())) nextErrors.email = dictionary.adminUsersDirectoryEmailInvalid;
    if (password.length < 12) nextErrors.password = dictionary.adminUsersDirectoryPasswordTooShort;
    setErrors(nextErrors);
    // Let the native POST proceed on a clean form: the field names and the
    // route stay exactly what the delivered `/admin/users` handler expects.
    if (Object.keys(nextErrors).length > 0) event.preventDefault();
  }

  return (
    <>
      <Button data-ds-hit-target onClick={() => handleOpenChange(true)}>
        <Plus aria-hidden className="size-4" />
        {dictionary.adminCreate}
      </Button>
      <Modal
        closeLabel={dictionary.cancel}
        description={dictionary.adminCreateDescription}
        onOpenChange={handleOpenChange}
        open={open}
        title={dictionary.adminCreateHeading}
      >
        <form action="/admin/users" className="grid gap-5" method="post" onSubmit={handleSubmit}>
          <FieldGroup className="grid gap-5">
            <Field data-invalid={Boolean(errors.username)}>
              <FieldLabel htmlFor={usernameId}>{dictionary.usernameLabel}</FieldLabel>
              <Input
                aria-invalid={Boolean(errors.username)}
                autoComplete="username"
                id={usernameId}
                name="username"
                onChange={(event) => setUsername(event.currentTarget.value)}
                required
                value={username}
              />
              {errors.username ? <FieldError>{errors.username}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor={emailId}>{dictionary.adminEmailLabel}</FieldLabel>
              <Input
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                id={emailId}
                name="email"
                onChange={(event) => setEmail(event.currentTarget.value)}
                type="email"
                value={email}
              />
              {errors.email ? <FieldError>{errors.email}</FieldError> : null}
            </Field>
            <Field data-invalid={Boolean(errors.password)}>
              <FieldLabel htmlFor={passwordId}>{dictionary.adminUsersDirectoryInitialPasswordLabel}</FieldLabel>
              <div className="flex gap-2">
                <Input
                  aria-describedby={passwordHelpId}
                  aria-invalid={Boolean(errors.password)}
                  autoComplete="new-password"
                  className="font-mono"
                  id={passwordId}
                  minLength={12}
                  name="password"
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  required
                  type="text"
                  value={password}
                />
                <Button onClick={() => setPassword(generatePassword())} type="button" variant="outline">
                  {dictionary.adminUsersDirectoryPasswordGenerate}
                </Button>
              </div>
              <FieldDescription id={passwordHelpId}>{dictionary.adminPasswordHelp}</FieldDescription>
              {errors.password ? <FieldError>{errors.password}</FieldError> : null}
              {password ? (
                <div className="mt-1 space-y-1">
                  <div aria-hidden className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full transition-all ${STRENGTH_METER_CLASS[strength]}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">{strengthLabel}</p>
                  {password.length >= 12 ? (
                    <CopyField
                      labels={{
                        copy: dictionary.adminUsersDirectoryCopyLabel,
                        pending: dictionary.adminUsersDirectoryCopyPending,
                        copied: dictionary.adminUsersDirectoryCopyCopied,
                        failed: dictionary.adminUsersDirectoryCopyFailed,
                      }}
                      truncate={false}
                      value={password}
                      variant="compact"
                    />
                  ) : null}
                </div>
              ) : null}
            </Field>
            <Field>
              <FieldLabel>{dictionary.adminRoleLabel}</FieldLabel>
              <SegmentedControl<Role>
                ariaLabel={dictionary.adminRoleLabel}
                name="role"
                onChange={setRole}
                options={[
                  { value: "USER", label: dictionary.adminUser },
                  { value: "ADMIN", label: dictionary.adminAdministrator },
                ]}
                value={role}
              />
            </Field>
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button onClick={() => handleOpenChange(false)} type="button" variant="outline">
              {dictionary.cancel}
            </Button>
            <AdminSubmit label={dictionary.adminCreate} />
          </div>
        </form>
      </Modal>
    </>
  );
}

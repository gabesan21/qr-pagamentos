"use client";

import { useEffect, useRef, useState } from "react";

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MerchantProfile } from "@/auth/profile";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type IdentityFieldsDictionary = Readonly<{
  usernameLabel: string;
  profileEmailLabel: string;
  profileEmailCaption: string;
  profileUsernameRequiredError: string;
  profileEmailInvalidError: string;
}>;

type IdentityFieldsProps = Readonly<{
  dictionary: IdentityFieldsDictionary;
  profile: MerchantProfile;
  onDirtyChange: (dirty: boolean) => void;
}>;

/**
 * The identity fields for `/profile`: uncontrolled inputs (so
 * `FormDraftGuard`'s direct DOM restore keeps working) with a dirty check
 * and submit-time validation wired through the closest `<form>`, the same
 * pattern `ProfileFormBody`/`FormDraftGuard` already use. Mounted as a child
 * of `ProfileFormBody`, so this effect always runs before the parent's —
 * `preventDefault()` here reaches the pending-state listener in time.
 */
export function IdentityFields({ dictionary, profile, onDirtyChange }: IdentityFieldsProps) {
  const usernameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    const usernameInput = usernameRef.current;
    const form = usernameInput?.closest("form");
    if (!usernameInput || !form) return;

    const baselineUsername = profile.username;
    const baselineEmail = profile.email ?? "";

    const checkDirty = () => {
      const dirty = (usernameRef.current?.value ?? "") !== baselineUsername || (emailRef.current?.value ?? "") !== baselineEmail;
      onDirtyChange(dirty);
    };

    const handleSubmit = (event: Event) => {
      const username = usernameRef.current?.value.trim() ?? "";
      const email = emailRef.current?.value.trim() ?? "";
      let invalid = false;
      if (!username) {
        setUsernameError(dictionary.profileUsernameRequiredError);
        invalid = true;
      } else {
        setUsernameError(null);
      }
      if (email && !EMAIL_PATTERN.test(email)) {
        setEmailError(dictionary.profileEmailInvalidError);
        invalid = true;
      } else {
        setEmailError(null);
      }
      if (invalid) event.preventDefault();
    };

    // Runs after FormDraftGuard's own mount effect (declared earlier as a
    // sibling), so a restored draft is already in the DOM here.
    checkDirty();
    form.addEventListener("input", checkDirty);
    form.addEventListener("submit", handleSubmit);
    return () => {
      form.removeEventListener("input", checkDirty);
      form.removeEventListener("submit", handleSubmit);
    };
  }, [dictionary.profileEmailInvalidError, dictionary.profileUsernameRequiredError, onDirtyChange, profile.email, profile.username]);

  return (
    <FieldGroup>
      <Field data-invalid={usernameError ? true : undefined}>
        <FieldLabel htmlFor="profile-username">{dictionary.usernameLabel}</FieldLabel>
        <Input autoComplete="username" defaultValue={profile.username} id="profile-username" maxLength={32} name="username" ref={usernameRef} required />
        {usernameError ? <FieldError>{usernameError}</FieldError> : null}
      </Field>
      <Field data-invalid={emailError ? true : undefined}>
        <FieldLabel htmlFor="profile-email">{dictionary.profileEmailLabel}</FieldLabel>
        <Input autoComplete="email" defaultValue={profile.email ?? ""} id="profile-email" maxLength={254} name="email" ref={emailRef} type="email" />
        <FieldDescription>{dictionary.profileEmailCaption}</FieldDescription>
        {emailError ? <FieldError>{emailError}</FieldError> : null}
      </Field>
    </FieldGroup>
  );
}

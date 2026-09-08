"use client";

import { useState } from "react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { FormDraftGuard } from "@/app/form-draft";
import type { AdminUserDetail } from "@/auth/admin-user-directory";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

const IDENTITY_FIELD_NAMES = ["username", "email"] as const;
const IDENTITY_FAILURE_NOTICES = ["conflict", "failed"] as const;

// Save stays disabled until a field actually diverges from the loaded
// values, so a click never re-submits an unmodified identity; the
// expected-version CAS still guards a stale form or a unique collision.
export function IdentityForm({ detail, dictionary }: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary }>) {
  const formId = `identity-form-${detail.id}`;
  const initialEmail = detail.email ?? "";
  const [username, setUsername] = useState(detail.username);
  const [email, setEmail] = useState(initialEmail);
  const dirty = username !== detail.username || email !== initialEmail;

  return (
    <form action={`/admin/users/${detail.id}/identity`} id={formId} method="post">
      <FormDraftGuard
        draftKey={`admin-identity-${detail.id}`}
        fieldNames={IDENTITY_FIELD_NAMES}
        formId={formId}
        noticeKey="editor"
        noticeValues={IDENTITY_FAILURE_NOTICES}
      />
      <p className="mb-4 text-sm text-muted-foreground">{dictionary.adminUserProfileIdentityDescription}</p>
      <Input name="expectedVersion" readOnly type="hidden" value={String(detail.editor.profileVersion)} />
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`identity-username-${detail.id}`}>{dictionary.usernameLabel}</FieldLabel>
          <Input
            autoComplete="off"
            className="font-mono"
            id={`identity-username-${detail.id}`}
            name="username"
            onChange={(event) => setUsername(event.currentTarget.value)}
            required
            value={username}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`identity-email-${detail.id}`}>{dictionary.adminEmailLabel}</FieldLabel>
          <Input
            autoComplete="off"
            id={`identity-email-${detail.id}`}
            name="email"
            onChange={(event) => setEmail(event.currentTarget.value)}
            type="email"
            value={email}
          />
          <FieldDescription>{dictionary.profileEmailCaption}</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="mt-5 flex justify-end">
        <AdminSubmit disabled={!dirty} label={dictionary.adminUserProfileIdentitySave} tone="secondary" />
      </div>
    </form>
  );
}

"use client";

import { useRef, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { SegmentedControl, type SegmentedControlOption } from "@/app/admin/admin-controls";
import { DestructiveActionForm } from "@/app/admin/accounts/destructive-confirm";
import type { AdminUserDetail } from "@/auth/admin-user-directory";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/modal";
import type { getDictionary } from "@/i18n/dictionaries";

type Dictionary = ReturnType<typeof getDictionary>;

type SegmentedMutationFieldProps = Readonly<{
  action: string;
  cancelLabel: string;
  confirmDescription: string;
  confirmLabel: string;
  confirmTitle: string;
  currentValue: string;
  destructiveValue: string;
  failureMessage: string;
  fieldLabel: string;
  name: string;
  options: readonly SegmentedControlOption[];
  pendingLabel: string;
  saveLabel: string;
}>;

// Role and status share this shape: a segmented value, a Save that stays
// disabled while unchanged, and a `ConfirmDialog` gate the destructive value
// must clear before the unchanged byte-frozen route ever receives the POST.
function SegmentedMutationField({
  action,
  cancelLabel,
  confirmDescription,
  confirmLabel,
  confirmTitle,
  currentValue,
  destructiveValue,
  failureMessage,
  fieldLabel,
  name,
  options,
  pendingLabel,
  saveLabel,
}: SegmentedMutationFieldProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(currentValue);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const dirty = value !== currentValue;
  const destructive = dirty && value === destructiveValue;

  return (
    <div className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <form action={action} method="post" ref={formRef}>
        <Field>
          <FieldLabel>{fieldLabel}</FieldLabel>
          <SegmentedControl ariaLabel={fieldLabel} name={name} onChange={setValue} options={options} value={value} />
        </Field>
        <div className="mt-3 flex justify-end">
          <Button
            disabled={!dirty}
            onClick={() => (destructive ? setConfirmOpen(true) : formRef.current?.requestSubmit())}
            type="button"
            variant="outline"
          >
            {saveLabel}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        description={confirmDescription}
        destructive
        failureMessage={failureMessage}
        onConfirm={() => formRef.current?.requestSubmit()}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pendingLabel={pendingLabel}
        title={confirmTitle}
      />
    </div>
  );
}

// The reset link keeps the delivered email flow: no temp password ever
// exists to display, so the template's confirm-then-result shape collapses
// to confirm-then-send, and the result surfaces as the page's `?reset=`
// toast once the route redirects back.
function PasswordResetAction({
  action,
  dictionary,
}: Readonly<{ action: string; dictionary: Dictionary }>) {
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <div>
        <p className="text-sm font-medium">{dictionary.adminUserProfilePasswordResetHeading}</p>
        <p className="text-xs text-muted-foreground">{dictionary.adminUserProfilePasswordResetDescription}</p>
      </div>
      <form action={action} className="contents" method="post" ref={formRef}>
        <Button data-ds-hit-target onClick={() => setOpen(true)} type="button" variant="outline">
          {dictionary.adminUserProfilePasswordResetSend}
        </Button>
      </form>
      <ConfirmDialog
        cancelLabel={dictionary.cancel}
        confirmLabel={dictionary.adminUserProfilePasswordResetSend}
        description={dictionary.adminUserProfilePasswordResetConfirmDescription}
        failureMessage={dictionary.adminUserProfilePasswordResetFailed}
        onConfirm={() => formRef.current?.requestSubmit()}
        onOpenChange={setOpen}
        open={open}
        pendingLabel={dictionary.loading}
        title={dictionary.adminUserProfilePasswordResetConfirmTitle}
      />
    </div>
  );
}

// TOTP recovery lets an administrator remove a configured second factor when
// the account lost access to the authenticator or recovery codes.
function TotpRecoverySection({
  configured,
  detail,
  dictionary,
}: Readonly<{ configured: boolean; detail: AdminUserDetail; dictionary: Dictionary }>) {
  return (
    <div className="border-t border-border pt-4">
      <p className="text-sm font-medium">{dictionary.adminUserProfileTotpHeading}</p>
      <div className="mt-1 flex items-start gap-3 text-sm text-muted-foreground">
        <TriangleAlertIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
        <p>{configured ? dictionary.adminUserProfileTotpConfigured : dictionary.adminUserProfileTotpNotConfigured}</p>
      </div>
      {configured ? (
        <div className="mt-4">
          <DestructiveActionForm
            action={`/admin/users/${detail.id}/totp-disable`}
            cancelLabel={dictionary.cancel}
            confirmLabel={dictionary.adminUserProfileTotpDisable}
            dialogDescription={dictionary.adminUserProfileTotpDisableConfirmDescription}
            dialogTitle={dictionary.adminUserProfileTotpDisableConfirmTitle}
            failureMessage={dictionary.adminUserProfileTotpDisableFailed}
            pendingLabel={dictionary.loading}
            triggerLabel={dictionary.adminUserProfileTotpDisable}
          />
        </div>
      ) : null}
    </div>
  );
}

// Role, status, and password changes re-house the legacy inline forms on
// their byte-frozen routes; those routes keep landing on the accounts
// workspace, which already toasts them.
export function AccessSection({
  detail,
  dictionary,
  totpConfigured,
}: Readonly<{ detail: AdminUserDetail; dictionary: Dictionary; totpConfigured: boolean }>) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{dictionary.adminUserProfileAccessDescription}</p>
      <SegmentedMutationField
        action={`/admin/users/${detail.id}/role`}
        cancelLabel={dictionary.adminCancel}
        confirmDescription={dictionary.adminDemotionDescription}
        confirmLabel={dictionary.adminConfirmDemotion}
        confirmTitle={dictionary.adminDemotionTitle}
        currentValue={detail.role}
        destructiveValue="USER"
        failureMessage={dictionary.adminUserProfileFailed}
        fieldLabel={dictionary.adminRoleLabel}
        name="role"
        options={[
          { value: "USER", label: dictionary.adminUser },
          { value: "ADMIN", label: dictionary.adminAdministrator },
        ]}
        pendingLabel={dictionary.loading}
        saveLabel={dictionary.adminSaveRole}
      />
      <SegmentedMutationField
        action={`/admin/users/${detail.id}/status`}
        cancelLabel={dictionary.adminCancel}
        confirmDescription={dictionary.adminDisableDescription}
        confirmLabel={dictionary.adminConfirmDisable}
        confirmTitle={dictionary.adminDisableTitle}
        currentValue={detail.status}
        destructiveValue="DISABLED"
        failureMessage={dictionary.adminUserProfileFailed}
        fieldLabel={dictionary.adminStatusLabel}
        name="status"
        options={[
          { value: "ACTIVE", label: dictionary.adminActive },
          { value: "DISABLED", label: dictionary.adminDisabled },
        ]}
        pendingLabel={dictionary.loading}
        saveLabel={dictionary.adminSaveStatus}
      />
      <div className="flex items-center justify-between border-t border-border pt-4">
        <div>
          <p className="text-sm font-medium">{dictionary.adminChangePassword}</p>
          <p className="text-xs text-muted-foreground">{dictionary.adminPasswordHelp}</p>
        </div>
        <form action={`/admin/users/${detail.id}/password`} method="post">
          <FieldGroup className="flex items-end gap-3">
            <Field>
              <FieldLabel htmlFor={`password-${detail.id}`}>{dictionary.passwordLabel}</FieldLabel>
              <Input
                aria-describedby={`password-help-${detail.id}`}
                autoComplete="new-password"
                className="font-mono"
                id={`password-${detail.id}`}
                minLength={12}
                name="password"
                required
                type="password"
              />
            </Field>
            <AdminSubmit label={dictionary.adminChangePassword} tone="secondary" />
          </FieldGroup>
        </form>
      </div>
      <PasswordResetAction action={`/admin/users/${detail.id}/reset-password`} dictionary={dictionary} />
      <TotpRecoverySection configured={totpConfigured} detail={detail} dictionary={dictionary} />
    </div>
  );
}

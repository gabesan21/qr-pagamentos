"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MerchantProfile } from "@/auth/profile";
import type { getDictionary } from "@/i18n/dictionaries";

import { FormDraftGuard } from "@/app/form-draft";
import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

import { IdentityFields } from "./identity-fields";
import { PasswordFields } from "./password-fields";
import { ProfileFormBody } from "./profile-form";
import { TotpSection } from "./totp-section";

type Dictionary = ReturnType<typeof getDictionary>;
export type ProfileNotice =
  | "identity-changed"
  | "identity-conflict"
  | "identity-failed"
  | "password-changed"
  | "password-failed"
  | null;
export type TotpNotice = "totp-enrolled" | "totp-confirmed" | "totp-disabled" | "totp-failed" | "totp-conflict" | null;

const IDENTITY_FORM_ID = "profile-identity-form";
const IDENTITY_DRAFT_FIELDS = ["username", "email"] as const;
const IDENTITY_FAILURE_NOTICES = ["conflict", "failed"] as const;

export function ProfileManagement({
  dictionary,
  notice,
  profile,
  totpNotice,
  totpStatus,
}: Readonly<{
  dictionary: Dictionary;
  notice: ProfileNotice;
  profile: MerchantProfile;
  totpNotice?: TotpNotice;
  totpStatus?: "none" | "pending" | "active";
}>) {
  const [identityDirty, setIdentityDirty] = useState(false);

  const identityCopy = notice === "identity-changed"
    ? dictionary.profileIdentityChanged
    : notice === "identity-conflict"
      ? dictionary.profileIdentityConflict
      : notice === "identity-failed"
        ? dictionary.profileIdentityFailed
        : null;
  const identityFailed = notice === "identity-conflict" || notice === "identity-failed";
  const identityValue = notice === "identity-changed" ? "changed" : notice === "identity-conflict" ? "conflict" : notice === "identity-failed" ? "failed" : null;

  const passwordCopy = notice === "password-changed"
    ? dictionary.passwordChangedSuccess
    : notice === "password-failed"
      ? dictionary.profilePasswordFailed
      : null;
  const passwordFailed = notice === "password-failed";
  const passwordValue = notice === "password-changed" ? "changed" : notice === "password-failed" ? "failed" : null;

  const noticeEntries: NoticeToastEntry[] = [];
  if (identityCopy && identityValue) {
    noticeEntries.push({ param: "identity", value: identityValue, kind: identityFailed ? "error" : "success", message: identityCopy });
  }
  if (passwordCopy && passwordValue) {
    noticeEntries.push({ param: "password", value: passwordValue, kind: passwordFailed ? "error" : "success", message: passwordCopy });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <NoticeToast notices={noticeEntries} />
      {identityCopy ? (
        <noscript>
          <Alert role={identityFailed ? "alert" : "status"} variant={identityFailed ? "destructive" : "success"}>
            <AlertTitle>{identityFailed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
            <AlertDescription>{identityCopy}</AlertDescription>
          </Alert>
        </noscript>
      ) : null}
      {passwordCopy ? (
        <noscript>
          <Alert role={passwordFailed ? "alert" : "status"} variant={passwordFailed ? "destructive" : "success"}>
            <AlertTitle>{passwordFailed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
            <AlertDescription>{passwordCopy}</AlertDescription>
          </Alert>
        </noscript>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{dictionary.profileIdentityTitle}</CardTitle>
          <CardDescription>{dictionary.profileIdentityDescription}</CardDescription>
        </CardHeader>
        <FormDraftGuard
          draftKey="profile-identity"
          fieldNames={IDENTITY_DRAFT_FIELDS}
          formId={IDENTITY_FORM_ID}
          noticeKey="identity"
          noticeValues={IDENTITY_FAILURE_NOTICES}
        />
        <form action="/profile/identity" id={IDENTITY_FORM_ID} method="post" noValidate>
          <ProfileFormBody disableSubmit={!identityDirty} label={dictionary.profileSaveIdentity} pendingLabel={dictionary.profileSavingIdentity}>
            <IdentityFields
              dictionary={{
                usernameLabel: dictionary.usernameLabel,
                profileEmailLabel: dictionary.profileEmailLabel,
                profileEmailCaption: dictionary.profileEmailCaption,
                profileUsernameRequiredError: dictionary.profileUsernameRequiredError,
                profileEmailInvalidError: dictionary.profileEmailInvalidError,
              }}
              onDirtyChange={setIdentityDirty}
              profile={profile}
            />
            <input name="expectedVersion" type="hidden" value={profile.version} />
          </ProfileFormBody>
        </form>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{dictionary.profilePasswordTitle}</CardTitle>
          <CardDescription>{dictionary.profilePasswordDescription}</CardDescription>
        </CardHeader>
        <form action="/profile/password" method="post" noValidate>
          <ProfileFormBody label={dictionary.profileChangePassword} pendingLabel={dictionary.profileChangingPassword}>
            <PasswordFields
              dictionary={{
                profileCurrentPasswordLabel: dictionary.profileCurrentPasswordLabel,
                profileNewPasswordLabel: dictionary.profileNewPasswordLabel,
                profileConfirmPasswordLabel: dictionary.profileConfirmPasswordLabel,
                profilePasswordShow: dictionary.profilePasswordShow,
                profilePasswordHide: dictionary.profilePasswordHide,
                profilePasswordLengthMeter: dictionary.profilePasswordLengthMeter,
                profilePasswordRequirement: dictionary.profilePasswordRequirement,
                profileCurrentPasswordRequiredError: dictionary.profileCurrentPasswordRequiredError,
                profilePasswordTooShortError: dictionary.profilePasswordTooShortError,
                profilePasswordTooLongError: dictionary.profilePasswordTooLongError,
                profilePasswordMismatchError: dictionary.profilePasswordMismatchError,
              }}
            />
          </ProfileFormBody>
        </form>
      </Card>
      {totpStatus !== undefined && (
        <TotpSection
          dictionary={{
            profileTotpTitle: dictionary.profileTotpTitle,
            profileTotpDescription: dictionary.profileTotpDescription,
            profileTotpNoneDescription: dictionary.profileTotpNoneDescription,
            profileTotpEnroll: dictionary.profileTotpEnroll,
            profileTotpEnrolling: dictionary.profileTotpEnrolling,
            profileTotpConfirm: dictionary.profileTotpConfirm,
            profileTotpConfirming: dictionary.profileTotpConfirming,
            profileTotpWrongCode: dictionary.profileTotpWrongCode,
            profileTotpActiveDescription: dictionary.profileTotpActiveDescription,
            profileTotpPendingDescription: dictionary.profileTotpPendingDescription,
            profileTotpDisable: dictionary.profileTotpDisable,
            profileTotpDisableDescription: dictionary.profileTotpDisableDescription,
            profileTotpRegenerate: dictionary.profileTotpRegenerate,
            profileTotpRegenerating: dictionary.profileTotpRegenerating,
            profileTotpRecoveryCodesTitle: dictionary.profileTotpRecoveryCodesTitle,
            profileTotpRecoveryCodesDescription: dictionary.profileTotpRecoveryCodesDescription,
            profileTotpCopied: dictionary.profileTotpCopied,
            profileTotpCopy: dictionary.profileTotpCopy,
            profileTotpDownload: dictionary.profileTotpDownload,
            profileTotpQrLabel: dictionary.profileTotpQrLabel,
            profileTotpQrCaption: dictionary.profileTotpQrCaption,
            profileTotpManualSecretLabel: dictionary.profileTotpManualSecretLabel,
            profileCurrentPasswordLabel: dictionary.profileCurrentPasswordLabel,
            profileTotpEnabledBadge: dictionary.profileTotpEnabledBadge,
            profileTotpConfirmStepTitle: dictionary.profileTotpConfirmStepTitle,
            profileTotpConfirmStepBody: dictionary.profileTotpConfirmStepBody,
            profileTotpCodesStepTitle: dictionary.profileTotpCodesStepTitle,
            profileTotpCodesStepBody: dictionary.profileTotpCodesStepBody,
            profileTotpContinue: dictionary.profileTotpContinue,
            profileTotpDone: dictionary.profileTotpDone,
            profileTotpCloseWarning: dictionary.profileTotpCloseWarning,
            profileTotpDisableTitle: dictionary.profileTotpDisableTitle,
            profileTotpDisableBody: dictionary.profileTotpDisableBody,
            profileTotpRegenerateTitle: dictionary.profileTotpRegenerateTitle,
            profileTotpRegenerateBody: dictionary.profileTotpRegenerateBody,
            profileTotpSavedCodes: dictionary.profileTotpSavedCodes,
            profileTotpCodeLabel: dictionary.profileTotpCodeLabel,
            cancel: dictionary.cancel,
            close: dictionary.close,
            loading: dictionary.loading,
            copyFieldCopied: dictionary.copyFieldCopied,
            copyFieldCopy: dictionary.copyFieldCopy,
            totpEnrolled: dictionary.totpEnrolled,
            totpConfirmed: dictionary.totpConfirmed,
            totpDisabled: dictionary.totpDisabled,
            totpFailed: dictionary.totpFailed,
            totpConflict: dictionary.totpConflict,
          }}
          notice={totpNotice ?? null}
          status={totpStatus}
        />
      )}
    </div>
  );
}

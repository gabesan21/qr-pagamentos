import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MerchantProfile } from "@/auth/profile";
import type { getDictionary } from "@/i18n/dictionaries";

import { FormDraftGuard } from "@/app/form-draft";
import { NoticeToast, type NoticeToastEntry } from "@/app/notice-toast";

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
    <div className="profile-workspace">
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
      <div className="profile-workspace__cards">
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
          <form action="/profile/identity" id={IDENTITY_FORM_ID} method="post">
            <ProfileFormBody label={dictionary.profileSaveIdentity} pendingLabel={dictionary.profileSavingIdentity}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="profile-username">{dictionary.usernameLabel}</FieldLabel>
                  <Input autoComplete="username" defaultValue={profile.username} id="profile-username" maxLength={32} name="username" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="profile-email">{dictionary.profileEmailLabel}</FieldLabel>
                  <Input autoComplete="email" defaultValue={profile.email ?? ""} id="profile-email" maxLength={254} name="email" type="email" />
                  <FieldDescription>{dictionary.profileEmailCaption}</FieldDescription>
                </Field>
              </FieldGroup>
              <input name="expectedVersion" type="hidden" value={profile.version} />
            </ProfileFormBody>
          </form>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.profilePasswordTitle}</CardTitle>
            <CardDescription>{dictionary.profilePasswordDescription}</CardDescription>
          </CardHeader>
          <form action="/profile/password" method="post">
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
              profileTotpConfirmTitle: dictionary.profileTotpConfirmTitle,
              profileTotpConfirmDescription: dictionary.profileTotpConfirmDescription,
              profileTotpConfirm: dictionary.profileTotpConfirm,
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
              profileTotpQrLabel: dictionary.profileTotpQrLabel,
              profileTotpQrCaption: dictionary.profileTotpQrCaption,
              profileCurrentPasswordLabel: dictionary.profileCurrentPasswordLabel,
              profileTotpEnabledBadge: dictionary.profileTotpEnabledBadge,
              profileTotpStep1Title: dictionary.profileTotpStep1Title,
              profileTotpStep1Body: dictionary.profileTotpStep1Body,
              profileTotpStep2Title: dictionary.profileTotpStep2Title,
              profileTotpStep2Body: dictionary.profileTotpStep2Body,
              profileTotpContinue: dictionary.profileTotpContinue,
              profileTotpBack: dictionary.profileTotpBack,
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
    </div>
  );
}

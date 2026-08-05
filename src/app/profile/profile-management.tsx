import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MerchantProfile } from "@/auth/profile";
import type { getDictionary } from "@/i18n/dictionaries";

import { PasswordFields } from "./password-fields";
import { ProfileFormBody } from "./profile-form";
import { TotpSection } from "./totp-section";

type Dictionary = ReturnType<typeof getDictionary>;
export type ProfileNotice = "identity-changed" | "identity-conflict" | "identity-failed" | "password-failed" | null;
export type TotpNotice = "totp-enrolled" | "totp-confirmed" | "totp-disabled" | "totp-failed" | "totp-conflict" | null;

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
  const noticeCopy = notice === "identity-changed"
    ? dictionary.profileIdentityChanged
    : notice === "identity-conflict"
      ? dictionary.profileIdentityConflict
      : notice === "identity-failed"
        ? dictionary.profileIdentityFailed
        : notice === "password-failed"
          ? dictionary.profilePasswordFailed
          : null;
  const noticeFailed = notice !== null && notice !== "identity-changed";

  const totpNoticeCopy = totpNotice === "totp-enrolled"
    ? dictionary.totpEnrolled
    : totpNotice === "totp-confirmed"
      ? dictionary.totpConfirmed
      : totpNotice === "totp-disabled"
        ? dictionary.totpDisabled
        : totpNotice === "totp-failed"
          ? dictionary.totpFailed
          : totpNotice === "totp-conflict"
            ? dictionary.totpConflict
            : null;
  const totpNoticeFailed = totpNotice === "totp-failed" || totpNotice === "totp-conflict";

  return (
    <div className="profile-workspace">
      {noticeCopy ? (
        <Alert role={noticeFailed ? "alert" : "status"} variant={noticeFailed ? "destructive" : "success"}>
          <AlertTitle>{noticeFailed ? dictionary.adminErrorHeading : dictionary.adminSuccessHeading}</AlertTitle>
          <AlertDescription>{noticeCopy}</AlertDescription>
        </Alert>
      ) : null}
      {totpNoticeCopy ? (
        <Alert role={totpNoticeFailed ? "alert" : "status"} variant={totpNoticeFailed ? "destructive" : "success"}>
          <AlertTitle>{dictionary.profileTotpTitle}</AlertTitle>
          <AlertDescription>{totpNoticeCopy}</AlertDescription>
        </Alert>
      ) : null}
      <div className="profile-workspace__cards">
        <Card>
          <CardHeader>
            <CardTitle>{dictionary.profileIdentityTitle}</CardTitle>
            <CardDescription>{dictionary.profileIdentityDescription}</CardDescription>
          </CardHeader>
          <form action="/profile/identity" method="post">
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

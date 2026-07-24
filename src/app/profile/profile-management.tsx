import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MerchantProfile } from "@/auth/profile";
import type { getDictionary } from "@/i18n/dictionaries";

import { ProfileFormBody } from "./profile-form";

type Dictionary = ReturnType<typeof getDictionary>;
export type ProfileNotice = "identity-changed" | "identity-conflict" | "identity-failed" | "password-failed" | null;

export function ProfileManagement({
  dictionary,
  notice,
  profile,
}: Readonly<{
  dictionary: Dictionary;
  notice: ProfileNotice;
  profile: MerchantProfile;
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

  return (
    <div className="profile-workspace">
      {noticeCopy ? (
        <Alert role={noticeFailed ? "alert" : "status"} variant={noticeFailed ? "destructive" : "success"}>
          <AlertDescription>{noticeCopy}</AlertDescription>
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
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="profile-current-password">{dictionary.profileCurrentPasswordLabel}</FieldLabel>
                  <Input autoComplete="current-password" id="profile-current-password" name="currentPassword" required type="password" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="profile-new-password">{dictionary.profileNewPasswordLabel}</FieldLabel>
                  <Input autoComplete="new-password" id="profile-new-password" minLength={12} name="newPassword" required type="password" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="profile-confirm-password">{dictionary.profileConfirmPasswordLabel}</FieldLabel>
                  <Input autoComplete="new-password" id="profile-confirm-password" minLength={12} name="confirmation" required type="password" />
                </Field>
              </FieldGroup>
            </ProfileFormBody>
          </form>
        </Card>
      </div>
    </div>
  );
}

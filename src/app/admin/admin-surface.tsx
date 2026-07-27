import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";

import { AccountMutationForm } from "@/app/admin/account-mutation-form";
import { AdminSubmit } from "@/app/admin/admin-submit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import type { getDictionary } from "@/i18n/dictionaries";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";

type Dictionary = ReturnType<typeof getDictionary>;
type AdminUser = Readonly<{ id: string; username: string; email: string | null; role: "ADMIN" | "USER"; status: "ACTIVE" | "DISABLED" }>;
type Notice = Readonly<{ tone: "success" | "error"; text: string }> | null;

export function AdminAccountsSurface({
  dictionary,
  notice,
  users,
}: Readonly<{ dictionary: Dictionary; notice: Notice; users: AdminUser[] }>) {
  return (
    <>
      <WorkspaceHeading
        description={dictionary.adminIntroduction}
        eyebrow={dictionary.shellAdminEyebrow}
        title={dictionary.adminUsersHeading}
      />
      {notice ? <AdminNotice dictionary={dictionary} notice={notice} /> : null}
      <CreateAccount dictionary={dictionary} />
      <Accounts dictionary={dictionary} users={users} />
    </>
  );
}

function AdminNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: Exclude<Notice, null> }>) {
  const success = notice.tone === "success";
  const Icon = success ? CircleCheckIcon : TriangleAlertIcon;
  return (
    <Alert aria-live={success ? "polite" : "assertive"} role={success ? "status" : "alert"} variant={success ? "success" : "destructive"}>
      <Icon aria-hidden="true" />
      <AlertTitle>{success ? dictionary.adminSuccessHeading : dictionary.adminErrorHeading}</AlertTitle>
      <AlertDescription>{notice.text}</AlertDescription>
    </Alert>
  );
}

function CreateAccount({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.adminCreateHeading}</CardTitle><CardDescription>{dictionary.adminCreateDescription}</CardDescription></CardHeader>
      <CardContent>
        <form action="/admin/users" method="post">
          <FieldGroup>
            <Field><FieldLabel htmlFor="username">{dictionary.usernameLabel}</FieldLabel><Input autoComplete="username" id="username" name="username" required /></Field>
            <Field><FieldLabel htmlFor="email">{dictionary.adminEmailLabel}</FieldLabel><Input autoComplete="email" id="email" name="email" type="email" /></Field>
            <Field><FieldLabel htmlFor="password">{dictionary.passwordLabel}</FieldLabel><Input aria-describedby="password-help" autoComplete="new-password" id="password" minLength={12} name="password" required type="password" /><FieldDescription id="password-help">{dictionary.adminPasswordHelp}</FieldDescription></Field>
            <Field><FieldLabel htmlFor="role">{dictionary.adminRoleLabel}</FieldLabel><NativeSelect defaultValue="USER" id="role" name="role"><NativeSelectOption value="USER">{dictionary.adminUser}</NativeSelectOption><NativeSelectOption value="ADMIN">{dictionary.adminAdministrator}</NativeSelectOption></NativeSelect></Field>
            <AdminSubmit label={dictionary.adminCreate} />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function Accounts({ dictionary, users }: Readonly<{ dictionary: Dictionary; users: AdminUser[] }>) {
  return (
    <Card>
      <CardHeader><CardTitle>{dictionary.adminUsersHeading}</CardTitle><CardDescription>{dictionary.adminUsersDescription}</CardDescription></CardHeader>
      <CardContent>
        {users.length === 0 ? <Alert><AlertTitle>{dictionary.adminEmpty}</AlertTitle><AlertDescription>{dictionary.adminEmptyDescription}</AlertDescription></Alert> : (
          <div className="admin-account-list">
            {users.map((user) => <Account dictionary={dictionary} key={user.id} user={user} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Account({ dictionary, user }: Readonly<{ dictionary: Dictionary; user: AdminUser }>) {
  return (
    <section aria-labelledby={`account-${user.id}`} className="admin-account">
      <div className="admin-account__facts">
        <h3 id={`account-${user.id}`}>{user.username}</h3>
        <dl><div><dt>{dictionary.adminEmail}</dt><dd>{user.email ?? dictionary.adminNotProvided}</dd></div><div><dt>{dictionary.adminRole}</dt><dd><Badge variant="outline">{user.role === "ADMIN" ? dictionary.adminAdministrator : dictionary.adminUser}</Badge></dd></div><div><dt>{dictionary.adminStatus}</dt><dd><Badge variant={user.status === "ACTIVE" ? "secondary" : "destructive"}>{user.status === "ACTIVE" ? dictionary.adminActive : dictionary.adminDisabled}</Badge></dd></div></dl>
      </div>
      <Separator />
      <div className="admin-account__actions">
        <AccountMutationForm action={`/admin/users/${user.id}/role`} cancelLabel={dictionary.adminCancel} confirmDescription={dictionary.adminDemotionDescription} confirmLabel={dictionary.adminConfirmDemotion} confirmTitle={dictionary.adminDemotionTitle} currentValue={user.role} destructiveValue="USER" fieldLabel={dictionary.adminRoleLabel} name="role" options={[{ value: "USER", label: dictionary.adminUser }, { value: "ADMIN", label: dictionary.adminAdministrator }]} saveLabel={dictionary.adminSaveRole} />
        <AccountMutationForm action={`/admin/users/${user.id}/status`} cancelLabel={dictionary.adminCancel} confirmDescription={dictionary.adminDisableDescription} confirmLabel={dictionary.adminConfirmDisable} confirmTitle={dictionary.adminDisableTitle} currentValue={user.status} destructiveValue="DISABLED" fieldLabel={dictionary.adminStatusLabel} name="status" options={[{ value: "ACTIVE", label: dictionary.adminActive }, { value: "DISABLED", label: dictionary.adminDisabled }]} saveLabel={dictionary.adminSaveStatus} />
        <form action={`/admin/users/${user.id}/password`} method="post"><FieldGroup><Field><FieldLabel htmlFor={`password-${user.id}`}>{dictionary.passwordLabel}</FieldLabel><Input autoComplete="new-password" id={`password-${user.id}`} minLength={12} name="password" required type="password" /></Field><AdminSubmit label={dictionary.adminChangePassword} tone="secondary" /></FieldGroup></form>
      </div>
    </section>
  );
}

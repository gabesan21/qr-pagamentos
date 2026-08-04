import type { ReactNode } from "react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { getDictionary } from "@/i18n/dictionaries";
import { WorkspaceHeading } from "@/app-shell/workspace-heading";

type Dictionary = ReturnType<typeof getDictionary>;
type Notice = Readonly<{ tone: "success" | "error"; text: string }> | null;

// The accounts workspace is the notice strip, the create-account section, and
// the administrator-global user directory composed by the page as children.
// The legacy inline mutation forms retired from this page (10.3.3 re-houses
// them in the profile editor) while their routes stay byte-frozen.
export function AdminAccountsSurface({
  children,
  dictionary,
  notice,
}: Readonly<{ children: ReactNode; dictionary: Dictionary; notice: Notice }>) {
  return (
    <>
      <WorkspaceHeading
        description={dictionary.adminIntroduction}
        eyebrow={dictionary.shellAdminEyebrow}
        title={dictionary.adminUsersHeading}
      />
      {notice ? <AdminNotice dictionary={dictionary} notice={notice} /> : null}
      <CreateAccount dictionary={dictionary} />
      {children}
    </>
  );
}

function AdminNotice({ dictionary, notice }: Readonly<{ dictionary: Dictionary; notice: Exclude<Notice, null> }>) {
  const success = notice.tone === "success";
  return (
    <Alert role={success ? "status" : "alert"} variant={success ? "success" : "destructive"}>
      <AlertTitle>{success ? dictionary.adminSuccessHeading : dictionary.adminErrorHeading}</AlertTitle>
      <AlertDescription>{notice.text}</AlertDescription>
    </Alert>
  );
}

function CreateAccount({ dictionary }: Readonly<{ dictionary: Dictionary }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{dictionary.adminCreateHeading}</CardTitle>
        <CardDescription>{dictionary.adminCreateDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action="/admin/users" method="post">
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="username">{dictionary.usernameLabel}</FieldLabel>
              <Input autoComplete="username" id="username" name="username" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">{dictionary.adminEmailLabel}</FieldLabel>
              <Input autoComplete="email" id="email" name="email" type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{dictionary.passwordLabel}</FieldLabel>
              <Input
                aria-describedby="password-help"
                autoComplete="new-password"
                id="password"
                minLength={12}
                name="password"
                required
                type="password"
              />
              <FieldDescription id="password-help">{dictionary.adminPasswordHelp}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="role">{dictionary.adminRoleLabel}</FieldLabel>
              <NativeSelect defaultValue="USER" id="role" name="role">
                <NativeSelectOption value="USER">{dictionary.adminUser}</NativeSelectOption>
                <NativeSelectOption value="ADMIN">{dictionary.adminAdministrator}</NativeSelectOption>
              </NativeSelect>
            </Field>
          </FieldGroup>
          <div className="mt-5 flex justify-end">
            <AdminSubmit label={dictionary.adminCreate} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

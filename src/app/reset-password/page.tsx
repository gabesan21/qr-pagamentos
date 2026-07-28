import { cookies } from "next/headers";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BrandIdentity } from "@/brand/brand-identity";
import { getDictionary } from "@/i18n/dictionaries";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";
import { getPasswordResetService } from "@/auth/password-reset";

import { ResetPasswordSubmit } from "./reset-password-submit";

export default async function ResetPasswordPage({ searchParams }: Readonly<{ searchParams: Promise<{ token?: string; error?: string }> }>) {
  const locale = localeFromPreferenceCookie((await cookies()).get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);
  const notices = await searchParams;
  const token = notices.token;
  const hasError = notices.error === "failed";

  const tokenValid = typeof token === "string" && token.length > 0
    ? await getPasswordResetService().validateResetChallenge(token).then((reference) => reference !== null).catch(() => false)
    : false;

  return <main className="reset-password-page">
    <Card className="reset-password-card">
      <CardHeader>
        <BrandIdentity className="reset-password-brand" variant="product-lockup" />
        <CardTitle>{dictionary.resetPasswordHeading}</CardTitle>
        <CardDescription>{dictionary.resetPasswordIntroduction}</CardDescription>
      </CardHeader>
      <CardContent>
        {!tokenValid && <Alert role="alert" variant="destructive"><AlertDescription>{dictionary.resetPasswordTokenInvalid}</AlertDescription></Alert>}
        {tokenValid && <form action="/reset-password/submit" className="reset-password-form" id="reset-password-form" method="post">
          {hasError && <Alert role="alert" variant="destructive"><AlertDescription>{dictionary.resetPasswordFailed}</AlertDescription></Alert>}
          <input name="token" type="hidden" value={token} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="newPassword">{dictionary.resetPasswordNewPasswordLabel}</FieldLabel>
              <Input autoComplete="new-password" id="newPassword" minLength={12} name="newPassword" required type="password" />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirmation">{dictionary.resetPasswordConfirmPasswordLabel}</FieldLabel>
              <Input autoComplete="new-password" id="confirmation" minLength={12} name="confirmation" required type="password" />
            </Field>
          </FieldGroup>
        </form>}
      </CardContent>
      {tokenValid && <CardFooter>
        <ResetPasswordSubmit form="reset-password-form" label={dictionary.resetPasswordSubmit} pendingLabel={dictionary.resetPasswordSubmitting} />
      </CardFooter>}
    </Card>
  </main>;
}

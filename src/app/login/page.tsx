import { cookies } from "next/headers";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BrandIdentity } from "@/brand/brand-identity";
import { getDictionary } from "@/i18n/dictionaries";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";

import { LoginSubmit } from "./login-submit";

export default async function LoginPage({ searchParams }: Readonly<{ searchParams: Promise<{ error?: string; password?: string }> }>) {
  const locale = localeFromPreferenceCookie((await cookies()).get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);
  const notices = await searchParams;
  const error = notices.error === "invalid-credentials" && notices.password === undefined;
  const passwordChanged = notices.password === "changed" && notices.error === undefined;

  return <main className="login-page">
    <Card className="login-card">
      <CardHeader>
        <BrandIdentity className="login-brand" variant="product-lockup" />
        <CardTitle>{dictionary.loginHeading}</CardTitle>
        <CardDescription>{dictionary.loginIntroduction}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action="/login/submit" className="login-form" id="login-form" method="post">
          {error && <Alert variant="destructive"><AlertDescription>{dictionary.invalidCredentials}</AlertDescription></Alert>}
          {passwordChanged && <Alert role="status" variant="success"><AlertDescription>{dictionary.passwordChanged}</AlertDescription></Alert>}
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="username">{dictionary.usernameLabel}</FieldLabel>
              <Input autoComplete="username" id="username" name="username" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">{dictionary.passwordLabel}</FieldLabel>
              <Input autoComplete="current-password" id="password" name="password" required type="password" />
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <LoginSubmit form="login-form" label={dictionary.signIn} pendingLabel={dictionary.signingIn} />
      </CardFooter>
    </Card>
  </main>;
}

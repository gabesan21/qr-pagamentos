import { cookies } from "next/headers";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { BrandIdentity } from "@/brand/brand-identity";
import { getDictionary } from "@/i18n/dictionaries";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";
import { LanguageSwitcher } from "@/app/language-preference/language-switcher";

import { LoginSubmit } from "./login-submit";
import { TotpChallengeForm } from "./totp-challenge-form";

type LoginSearchParams = { error?: string; password?: string; mfa?: string };

export default async function LoginPage({ searchParams }: Readonly<{ searchParams: Promise<LoginSearchParams> }>) {
  const locale = localeFromPreferenceCookie((await cookies()).get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);
  const notices = await searchParams;
  const error = notices.error === "invalid-credentials" && notices.password === undefined && notices.mfa === undefined;
  const passwordChanged = notices.password === "changed" && notices.error === undefined && notices.mfa === undefined;
  const mfaFailed = notices.mfa === "failed";
  const mfaRequired = notices.mfa === "required" || mfaFailed;

  return (
    <main className="auth-page login-page">
      <Card className="auth-card">
        {mfaRequired ? (
          <>
            <div className="auth-card__form">
              <CardHeader>
                <BrandIdentity className="auth-brand" variant="product-lockup" />
                <CardAction>
                  <LanguageSwitcher label={dictionary.languageLabel} locale={locale} />
                </CardAction>
                <CardTitle>{dictionary.mfaHeading}</CardTitle>
                <CardDescription>{dictionary.mfaIntroduction}</CardDescription>
              </CardHeader>
              <CardContent>
                <TotpChallengeForm dictionary={dictionary} failed={mfaFailed} />
              </CardContent>
            </div>
            <div className="auth-card__panel" aria-hidden="true">
              <BrandIdentity className="auth-card__panel-brand" variant="product-lockup" />
            </div>
          </>
        ) : (
          <>
            <form action="/login/submit" className="auth-card__form login-form" id="login-form" method="post">
              <CardHeader>
                <BrandIdentity className="auth-brand" variant="product-lockup" />
                <CardAction>
                  <LanguageSwitcher label={dictionary.languageLabel} locale={locale} />
                </CardAction>
                <CardTitle>{dictionary.loginHeading}</CardTitle>
                <CardDescription>{dictionary.loginIntroduction}</CardDescription>
              </CardHeader>
              <CardContent>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{dictionary.invalidCredentials}</AlertDescription>
                  </Alert>
                )}
                {passwordChanged && (
                  <Alert role="status" variant="success">
                    <AlertDescription>{dictionary.passwordChangedSuccess}</AlertDescription>
                  </Alert>
                )}
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
              </CardContent>
              <CardFooter>
                <LoginSubmit label={dictionary.signIn} pendingLabel={dictionary.signingIn} />
              </CardFooter>
            </form>
            <div className="auth-card__panel" aria-hidden="true">
              <BrandIdentity className="auth-card__panel-brand" variant="product-lockup" />
            </div>
          </>
        )}
      </Card>
    </main>
  );
}

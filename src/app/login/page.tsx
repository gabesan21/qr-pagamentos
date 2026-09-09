import { cookies } from "next/headers";

import { BrandIdentity } from "@/brand/brand-identity";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/i18n/dictionaries";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";
import { LanguageSwitcher } from "@/app/language-preference/language-switcher";
import { AuthCard } from "@/app/auth-card";

import { LoginForm } from "./login-form";
import { TotpChallengeForm } from "./totp-challenge-form";

type LoginSearchParams = { error?: string; password?: string; mfa?: string };

export default async function LoginPage({ searchParams }: Readonly<{ searchParams: Promise<LoginSearchParams> }>) {
  const locale = localeFromPreferenceCookie((await cookies()).get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);
  const notices = await searchParams;
  const invalidCredentials = notices.error === "invalid-credentials" && notices.password === undefined && notices.mfa === undefined;
  const passwordChanged = notices.password === "changed" && notices.error === undefined && notices.mfa === undefined;
  const mfaFailed = notices.mfa === "failed";
  const mfaRequired = notices.mfa === "required" || mfaFailed;

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <AuthCard
        caption={dictionary.heading}
        languageControl={<LanguageSwitcher label={dictionary.languageLabel} locale={locale} />}
        tagline={dictionary.introduction}
      >
        {mfaRequired ? (
          <>
            <CardHeader>
              <BrandIdentity className="auth-brand" variant="product-lockup" />
              <CardTitle>{dictionary.mfaHeading}</CardTitle>
              <CardDescription>{dictionary.mfaIntroduction}</CardDescription>
            </CardHeader>
            <CardContent>
              <TotpChallengeForm dictionary={dictionary} failed={mfaFailed} />
            </CardContent>
          </>
        ) : (
          <LoginForm dictionary={dictionary} invalidCredentials={invalidCredentials} passwordChanged={passwordChanged} />
        )}
      </AuthCard>
    </main>
  );
}

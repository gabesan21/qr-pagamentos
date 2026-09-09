import { cookies } from "next/headers";

import { BrandIdentity } from "@/brand/brand-identity";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDictionary } from "@/i18n/dictionaries";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";
import { getPasswordResetService } from "@/auth/password-reset";
import { LanguageSwitcher } from "@/app/language-preference/language-switcher";
import { AuthCard } from "@/app/auth-card";

import { ResetPasswordForm } from "./reset-password-form";

type ResetPasswordSearchParams = Readonly<{ error?: string; status?: string; token?: string }>;

/**
 * The reset service folds every unusable-token cause (consumed, expired,
 * unknown) into one `null` (`src/auth/password-reset.ts:94-96,159-173`), so
 * this page proves only the two states it can distinguish itself: no token
 * at all, and a token the service rejects. The success state renders here
 * too, driven by the submit route's `status=changed` redirect, so the flow
 * never leaves `/reset-password`.
 */
export default async function ResetPasswordPage({ searchParams }: Readonly<{ searchParams: Promise<ResetPasswordSearchParams> }>) {
  const locale = localeFromPreferenceCookie((await cookies()).get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);
  const notices = await searchParams;
  const token = notices.token;
  const success = notices.status === "changed";
  const hasError = notices.error === "failed";
  const hasToken = typeof token === "string" && token.length > 0;

  const tokenValid = !success && hasToken
    ? await getPasswordResetService().validateResetChallenge(token).then((reference) => reference !== null).catch(() => false)
    : false;

  return (
    <main className="grid min-h-svh place-items-center p-4">
      <AuthCard
        caption={dictionary.resetPasswordIntroduction}
        languageControl={<LanguageSwitcher label={dictionary.languageLabel} locale={locale} />}
        tagline={dictionary.resetPasswordHeading}
      >
        {success ? (
          <>
            <CardHeader>
              <BrandIdentity className="auth-brand" variant="product-lockup" />
              <CardTitle>{dictionary.resetPasswordSuccessHeading}</CardTitle>
              <CardDescription>{dictionary.resetPasswordSuccessBody}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <a href="/login">{dictionary.signIn}</a>
              </Button>
            </CardContent>
          </>
        ) : !hasToken ? (
          <>
            <img alt="" aria-hidden="true" className="mx-auto mt-6 size-24" src="/application-assets/unavailable.svg" />
            <CardHeader>
              <BrandIdentity className="auth-brand" variant="product-lockup" />
              <CardTitle>{dictionary.resetPasswordNoTokenHeading}</CardTitle>
              <CardDescription>{dictionary.resetPasswordNoTokenBody}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="secondary">
                <a href="/login">{dictionary.resetPasswordBackToLogin}</a>
              </Button>
            </CardContent>
          </>
        ) : !tokenValid ? (
          <>
            <img alt="" aria-hidden="true" className="mx-auto mt-6 size-24" src="/application-assets/unavailable.svg" />
            <CardHeader>
              <BrandIdentity className="auth-brand" variant="product-lockup" />
              <CardTitle>{dictionary.resetPasswordRejectedHeading}</CardTitle>
              <CardDescription>{dictionary.resetPasswordRejectedBody}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full" variant="secondary">
                <a href="/login">{dictionary.resetPasswordBackToLogin}</a>
              </Button>
            </CardContent>
          </>
        ) : (
          <ResetPasswordForm dictionary={dictionary} hasError={hasError} token={token} />
        )}
      </AuthCard>
    </main>
  );
}

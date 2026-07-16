import { notFound } from "next/navigation";

import { getDictionary } from "@/i18n/dictionaries";
import { isSupportedLocale } from "@/i18n/locales";

export default async function LoginPage({ params, searchParams }: Readonly<{ params: Promise<{ lang: string }>; searchParams: Promise<{ error?: string }> }>) {
  const { lang } = await params;
  if (!isSupportedLocale(lang)) notFound();
  const dictionary = getDictionary(lang);
  const error = (await searchParams).error === "invalid-credentials";
  return <main>
    <h1>{dictionary.loginHeading}</h1>
    {error && <p role="alert">{dictionary.invalidCredentials}</p>}
    <form action={`/${lang}/login/submit`} method="post">
      <label htmlFor="username">{dictionary.usernameLabel}</label>
      <input id="username" name="username" autoComplete="username" required />
      <label htmlFor="password">{dictionary.passwordLabel}</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <button type="submit">{dictionary.signIn}</button>
    </form>
  </main>;
}
